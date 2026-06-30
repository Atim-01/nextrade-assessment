import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config()

// 1. Create a standard Postgres connection pool
const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })

// 2. Wrap it in Prisma's Postgres adapter
const adapter = new PrismaPg(pool)

// 3. Set up the singleton pattern
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 4. Pass the adapter to PrismaClient!
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}