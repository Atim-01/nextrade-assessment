import { z } from 'zod'
import dotenv from 'dotenv'
dotenv.config()

const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  MNEMONIC: z.string().min(10),
  SWEEP_THRESHOLD: z.string(),
  TREASURY_ADDRESS: z.string().startsWith('0x'),
  CHAIN_RPC: z.string().url(),
  CHAIN_ID: z.string(),
  PORT: z.string().default('3000'),
})

export const env = envSchema.parse(process.env)