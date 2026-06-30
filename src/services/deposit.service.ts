import { prisma } from '../lib/prisma'
import { getProvider } from '../lib/wallet'
import { ethers } from 'ethers'

const CONFIRMATIONS_REQUIRED = 2

export async function checkDeposits(): Promise<void> {
  const provider = getProvider()
  const currentBlock = await provider.getBlockNumber()

  const wallets = await prisma.wallet.findMany({
    include: { user: true }
  })

  for (const wallet of wallets) {
    await detectBalanceDeposit(wallet, provider, currentBlock)
  }
}

async function detectBalanceDeposit(
  wallet: { id: string; address: string; userId: string },
  provider: ethers.JsonRpcProvider,
  currentBlock: number
): Promise<void> {
  const blocksToScan = 5
  const startBlock = Math.max(0, currentBlock - blocksToScan)

  for (let blockNum = startBlock; blockNum <= currentBlock; blockNum++) {
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

        const newAmount = (
          parseFloat(balance.amount) + parseFloat(amountEth)
        ).toFixed(8)

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