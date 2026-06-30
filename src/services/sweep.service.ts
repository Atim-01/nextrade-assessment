import { prisma } from '../lib/prisma'
import { getProvider, getSignerWallet } from '../lib/wallet'
import { ethers } from 'ethers'

const SWEEP_THRESHOLD = parseFloat(process.env.SWEEP_THRESHOLD || '0.001')

export async function runSweep(): Promise<void> {
  const provider = getProvider()
  const treasuryAddress = process.env.TREASURY_ADDRESS

  if (!treasuryAddress) throw new Error('TREASURY_ADDRESS not set')

  // Get all user wallets
  const wallets = await prisma.wallet.findMany()

  console.log(`Sweep started — checking ${wallets.length} wallets`)

  for (const wallet of wallets) {
    await sweepWallet(wallet, provider, treasuryAddress)
  }

  console.log('Sweep complete')
}

async function sweepWallet(
  wallet: { id: string; userId: string; address: string; derivationIndex: number },
  provider: ethers.JsonRpcProvider,
  treasuryAddress: string
): Promise<void> {
  try {
    // Get the actual onchain balance of this deposit address
    const onchainBalance = await provider.getBalance(wallet.address)

    if (onchainBalance === 0n) return

    const balanceEth = parseFloat(ethers.formatEther(onchainBalance))

    if (balanceEth < SWEEP_THRESHOLD) {
      console.log(`Wallet ${wallet.address}: ${balanceEth} ETH below threshold, skipping`)
      return
    }

    // Estimate gas cost so we don't send more than we have
    const feeData = await provider.getFeeData()
    const gasLimit = 21000n
    const gasPrice = feeData.gasPrice ?? ethers.parseUnits('2', 'gwei')
    // Add 20% buffer to gas cost to ensure tx doesn't fail
    const gasCost = gasLimit * gasPrice * 120n / 100n

    // Amount to send = total balance minus gas cost
    const amountToSend = onchainBalance - gasCost

    if (amountToSend <= 0n) {
      console.log(`Wallet ${wallet.address}: balance too low to cover gas, skipping`)
      return
    }

    // Sign and broadcast sweep transaction
    const signer = getSignerWallet(wallet.derivationIndex, provider)

    const tx = await signer.sendTransaction({
      to: treasuryAddress,
      value: amountToSend,
      gasLimit,
      gasPrice,
    })

    console.log(`Sweep broadcast: ${wallet.address} → treasury | ${ethers.formatEther(amountToSend)} ETH | tx: ${tx.hash}`)

    // Wait for confirmation
    await tx.wait(2)

    // Record the sweep transaction
    await prisma.transaction.create({
      data: {
        userId: wallet.userId,
        type: 'SWEEP',
        txHash: tx.hash,
        amount: ethers.formatEther(amountToSend),
        toAddress: treasuryAddress,
        status: 'CONFIRMED',
      }
    })

    console.log(`Sweep confirmed: ${wallet.address} → treasury`)

  } catch (err: any) {
    // Log but don't throw — one failed sweep shouldn't stop others
    console.error(`Sweep failed for wallet ${wallet.address}:`, err.message)
  }
}