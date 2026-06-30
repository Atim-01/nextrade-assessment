import { Worker, Job } from 'bullmq'
import { connection, depositMonitorQueue } from '../lib/queue'
import { checkDeposits } from '../services/deposit.service'

// Process deposit check jobs
const depositWorker = new Worker(
  'deposit-monitor',
  async (job: Job) => {
    console.log(`Running deposit check job ${job.id}`)
    await checkDeposits()
    console.log(`Deposit check complete`)
  },
  { connection }
)

depositWorker.on('completed', (job) => {
  console.log(`Deposit monitor job ${job.id} completed`)
})

depositWorker.on('failed', (job, err) => {
  console.error(`Deposit monitor job ${job?.id} failed:`, err.message)
})

// Schedule recurring deposit checks every 30 seconds
export async function startDepositMonitor(): Promise<void> {
  // Remove any existing repeatable jobs to avoid duplicates on restart
  const repeatableJobs = await depositMonitorQueue.getRepeatableJobs()
  for (const job of repeatableJobs) {
    await depositMonitorQueue.removeRepeatableByKey(job.key)
  }

  await depositMonitorQueue.add(
    'check-deposits',
    {},
    {
      repeat: { every: 30000 }, // every 30 seconds
      removeOnComplete: 10,
      removeOnFail: 5,
    }
  )

  console.log('Deposit monitor started — checking every 30 seconds')
}

export { depositWorker }