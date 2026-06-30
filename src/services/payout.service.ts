import { prisma } from '../lib/prisma'
import { getProvider, getSignerWallet } from '../lib/wallet'
import { ethers } from 'ethers'
import Decimal from 'decimal.js'

export async function requestPayout(
  userId: string,
  toAddress: string,
  amountEth: string
): Promise<{ txHash: string }> {

  if (!ethers.isAddress(toAddress)) {
    throw new Error('Invalid destination address')
  }

  const amount = new Decimal(amountEth)
  if (amount.lte(0)) throw new Error('Invalid amount')

  const wallet = await prisma.wallet.findUnique({ where: { userId } })
  if (!wallet) throw new Error('Wallet not found')

  const balance = await prisma.balance.findUnique({ where: { userId } })
  if (!balance) throw new Error('Balance not found')

  const available = new Decimal(balance.amount)
  const locked = new Decimal(balance.locked)

  if (available.lt(amount)) {
    throw new Error(`Insufficient balance. Available: ${available.toFixed(8)} ETH`)
  }

  // Lock balance before broadcast
  await prisma.balance.update({
    where: { userId },
    data: {
      amount: available.minus(amount).toFixed(8),
      locked: locked.plus(amount).toFixed(8),
    }
  })

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      type: 'PAYOUT',
      amount: amountEth,
      toAddress,
      status: 'PENDING',
    }
  })

  try {
    const provider = getProvider()
    const signer = getSignerWallet(wallet.derivationIndex, provider)

    const tx = await signer.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(amountEth),
    })

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { txHash: tx.hash, status: 'CONFIRMING' }
    })

    confirmPayout(tx, transaction.id, userId, amount).catch(err => {
      console.error(`Payout confirmation failed for tx ${tx.hash}:`, err)
    })

    return { txHash: tx.hash }

  } catch (err: any) {
    // Restore balance on failure
    await prisma.balance.update({
      where: { userId },
      data: {
        amount: available.toFixed(8),
        locked: locked.toFixed(8),
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
  amount: Decimal
): Promise<void> {
  try {
    await tx.wait(2)

    const balance = await prisma.balance.findUnique({ where: { userId } })
    if (!balance) return

    const locked = new Decimal(balance.locked)

    await prisma.balance.update({
      where: { userId },
      data: {
        locked: Decimal.max(0, locked.minus(amount)).toFixed(8),
      }
    })

    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: 'CONFIRMED' }
    })

    console.log(`Payout confirmed: ${amount.toFixed(8)} ETH tx ${tx.hash}`)

  } catch (err) {
    const balance = await prisma.balance.findUnique({ where: { userId } })
    if (!balance) return

    const available = new Decimal(balance.amount)
    const locked = new Decimal(balance.locked)

    await prisma.balance.update({
      where: { userId },
      data: {
        amount: available.plus(amount).toFixed(8),
        locked: Decimal.max(0, locked.minus(amount)).toFixed(8),
      }
    })

    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: 'FAILED' }
    })

    console.error(`Payout failed, balance restored for user ${userId}`)
  }
}