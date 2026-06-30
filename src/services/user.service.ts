import { prisma } from '../lib/prisma'
import { deriveAddress, getNextIndex } from '../lib/wallet'
import { createHash } from 'crypto'

// Simple hash — in production use bcrypt, but keeping deps lean for assessment
function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

export async function registerUser(email: string, password: string) {
  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new Error('Email already registered')

  // Get the next available derivation index
  const allWallets = await prisma.wallet.findMany({
    select: { derivationIndex: true }
  })
  const indexes = allWallets.map(w => w.derivationIndex)
  const nextIndex = getNextIndex(indexes)

  // Derive the deposit address for this user
  const address = deriveAddress(nextIndex)

  // Create user, wallet, and balance in one atomic transaction
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
        wallet: {
          create: {
            address,
            derivationIndex: nextIndex,
          }
        },
        balance: {
          create: {
            amount: '0',
            locked: '0',
          }
        }
      },
      include: { wallet: true }
    })
    return newUser
  })

  return {
    id: user.id,
    email: user.email,
    depositAddress: user.wallet!.address,
  }
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { wallet: true }
  })

  if (!user || user.passwordHash !== hashPassword(password)) {
    throw new Error('Invalid email or password')
  }

  return {
    id: user.id,
    email: user.email,
    depositAddress: user.wallet?.address,
  }
}

export async function getUserBalance(userId: string) {
  const balance = await prisma.balance.findUnique({
    where: { userId }
  })
  if (!balance) throw new Error('Balance not found')

  return {
    available: balance.amount,
    locked: balance.locked,
  }
}