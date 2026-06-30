import { prisma } from '../lib/prisma'
import { getProvider, getSignerWallet } from '../lib/wallet'
import { ethers } from 'ethers'

export async function requestPayout(
  userId: string,
  toAddress: string,
  amountEth: string
): Promise<{ txHash: string }> {

  // Validate address
  if (!ethers.isAddress(toAddress)) {
    throw new Error('Invalid destination address')
  }

  const amount = parseFloat(amountEth)
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Invalid amount')
  }

  // Get user wallet derivation index
  const wallet = await prisma.wallet.findUnique({ where: { userId } })
  if (!wallet) throw new Error('Wallet not found')

  // Lock balance atomically — this prevents double-spend
  const balance = await prisma.balance.findUnique({ where: { userId } })
  if (!balance) throw new Error('Balance not found')

  const available = parseFloat(balance.amount)
  const locked = parseFloat(balance.locked)

  if (available < amount) {
    throw new Error(`Insufficient balance. Available: ${available} ETH`)
  }

  // Deduct from available, add to locked
  await prisma.balance.update({
    where: { userId },
    data: {
      amount: (available - amount).toFixed(8),
      locked: (locked + amount).toFixed(8),
    }
  })

  // Create a pending transaction record
  const transaction = await prisma.transaction.create({
    data: {
      userId,
      type: 'PAYOUT',
      amount: amountEth,
      toAddress,
      status: 'PENDING',
    }
  })

  // Broadcast the transaction
  try {
    const provider = getProvider()
    const signer = getSignerWallet(wallet.derivationIndex, provider)

    const tx = await signer.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(amountEth),
    })

    // Update transaction with hash
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { txHash: tx.hash, status: 'CONFIRMING' }
    })

    // Wait for confirmation in background
    confirmPayout(tx, transaction.id, userId, amount).catch(err => {
      console.error(`Payout confirmation failed for tx ${tx.hash}:`, err)
    })

    return { txHash: tx.hash }

  } catch (err: any) {
    // Broadcast failed — restore balance
    await prisma.balance.update({
      where: { userId },
      data: {
        amount: (available).toFixed(8),
        locked: (locked).toFixed(8),
      }
    })

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED' }
    })

    throw new Error(`Transaction failed: ${err.message}`)
  }
}

async function confirmPayout(
  tx: ethers.TransactionResponse,
  transactionId: string,
  userId: string,
  amount: number
): Promise<void> {
  try {
    // Wait for 2 confirmations
    await tx.wait(2)

    // Deduct from locked balance
    const balance = await prisma.balance.findUnique({ where: { userId } })
    if (!balance) return

    const locked = parseFloat(balance.locked)

    await prisma.balance.update({
      where: { userId },
      data: {
        locked: Math.max(0, locked - amount).toFixed(8),
      }
    })

    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: 'CONFIRMED' }
    })

    console.log(`Payout confirmed: ${amount} ETH, tx ${tx.hash}`)

  } catch (err) {
    // Confirmation failed — restore full balance
    const balance = await prisma.balance.findUnique({ where: { userId } })
    if (!balance) return

    const available = parseFloat(balance.amount)
    const locked = parseFloat(balance.locked)

    await prisma.balance.update({
      where: { userId },
      data: {
        amount: (available + amount).toFixed(8),
        locked: Math.max(0, locked - amount).toFixed(8),
      }
    })

    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: 'FAILED' }
    })

    console.error(`Payout failed, balance restored for user ${userId}`)
  }
}