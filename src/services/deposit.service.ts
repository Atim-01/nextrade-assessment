import { prisma } from '../lib/prisma'
import { getProvider } from '../lib/wallet'
import { ethers } from 'ethers'
import Decimal from 'decimal.js'

const CONFIRMATIONS_REQUIRED = 2

export async function checkDeposits(): Promise<void> {
  const provider = getProvider()
  const currentBlock = await provider.getBlockNumber()

  // Persist last scanned block to avoid missing deposits during downtime
  const scanState = await prisma.scanState.findFirst()
  const fromBlock = scanState
    ? Math.max(scanState.lastScannedBlock, currentBlock - 50)
    : currentBlock - 50

  const wallets = await prisma.wallet.findMany()

  console.log(`Scanning blocks ${fromBlock} to ${currentBlock} for ${wallets.length} wallets`)

  for (const wallet of wallets) {
    await detectBalanceDeposit(wallet, provider, fromBlock, currentBlock)
  }

  // Update last scanned block
  if (scanState) {
    await prisma.scanState.update({
      where: { id: scanState.id },
      data: { lastScannedBlock: currentBlock }
    })
  } else {
    await prisma.scanState.create({
      data: { lastScannedBlock: currentBlock }
    })
  }
}

async function detectBalanceDeposit(
  wallet: { id: string; address: string; userId: string },
  provider: ethers.JsonRpcProvider,
  fromBlock: number,
  currentBlock: number
): Promise<void> {
  for (let blockNum = fromBlock; blockNum <= currentBlock; blockNum++) {
    const block = await provider.getBlock(blockNum, true)
    if (!block || !block.transactions) continue

    for (const tx of block.prefetchedTransactions) {
      if (!tx.to || tx.to.toLowerCase() !== wallet.address.toLowerCase()) continue
      if (!tx.value || tx.value === 0n) continue

      const existing = await prisma.transaction.findUnique({
        where: { txHash: tx.hash }
      })
      if (existing) continue

      const confirmations = currentBlock - blockNum
      if (confirmations < CONFIRMATIONS_REQUIRED) continue

      const amountEth = ethers.formatEther(tx.value)

      await prisma.$transaction(async (txClient) => {
        const balance = await txClient.balance.findUnique({
          where: { userId: wallet.userId }
        })
        if (!balance) return

        // Decimal precision — no floating point errors
        const newAmount = new Decimal(balance.amount)
          .plus(new Decimal(amountEth))
          .toFixed(8)

        await txClient.balance.update({
          where: { userId: wallet.userId },
          data: { amount: newAmount }
        })

        await txClient.transaction.create({
          data: {
            userId: wallet.userId,
            type: 'DEPOSIT',
            txHash: tx.hash,
            amount: amountEth,
            status: 'CONFIRMED',
          }
        })

        console.log(`Deposit confirmed: ${amountEth} ETH for user ${wallet.userId}`)
      })
    }
  }
}