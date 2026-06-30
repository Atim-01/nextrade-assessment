import { Queue, Worker, ConnectionOptions } from 'bullmq'

const connection: ConnectionOptions = {
  host: '127.0.0.1',
  port: 6379,
}

// Queue names as constants — avoids typo bugs
export const QUEUE_NAMES = {
  DEPOSIT_MONITOR: 'deposit-monitor',
  PAYOUT: 'payout',
  SWEEP: 'sweep',
} as const

// Queues — used to add jobs
export const depositMonitorQueue = new Queue(
  QUEUE_NAMES.DEPOSIT_MONITOR,
  { connection }
)

export const payoutQueue = new Queue(
  QUEUE_NAMES.PAYOUT,
  { connection }
)

export const sweepQueue = new Queue(
  QUEUE_NAMES.SWEEP,
  { connection }
)

export { connection }