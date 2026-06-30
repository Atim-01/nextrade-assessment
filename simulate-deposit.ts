import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'
dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function simulateDeposit() {
  // Get the first user wallet
  const wallet = await prisma.wallet.findFirst({
    include: { user: true }
  })

  if (!wallet) {
    console.log('No wallets found — register a user first')
    await prisma.$disconnect()
    return
  }

  const simulatedTxHash = `0xSIMULATED_${Date.now()}`
  const depositAmount = '0.05'

  console.log(`\nSimulating deposit for user: ${wallet.user.email}`)
  console.log(`Deposit address: ${wallet.address}`)
  console.log(`Amount: ${depositAmount} ETH`)
  console.log(`Simulated tx hash: ${simulatedTxHash}\n`)

  // Credit balance and record transaction atomically
  await prisma.$transaction(async (tx) => {
    const balance = await tx.balance.findUnique({
      where: { userId: wallet.userId }
    })

    if (!balance) throw new Error('Balance record not found')

    const newAmount = (
      parseFloat(balance.amount) + parseFloat(depositAmount)
    ).toFixed(8)

    await tx.balance.update({
      where: { userId: wallet.userId },
      data: { amount: newAmount }
    })

    await tx.transaction.create({
      data: {
        userId: wallet.userId,
        type: 'DEPOSIT',
        txHash: simulatedTxHash,
        amount: depositAmount,
        status: 'CONFIRMED',
      }
    })
  })

  // Verify
  const updated = await prisma.balance.findUnique({
    where: { userId: wallet.userId }
  })

  console.log('✅ Deposit simulated successfully')
  console.log(`New balance: ${updated?.amount} ETH`)

  await prisma.$disconnect()
  await pool.end()
}

simulateDeposit().catch(console.error)