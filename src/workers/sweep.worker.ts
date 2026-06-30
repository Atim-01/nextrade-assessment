import { Worker, Job } from 'bullmq'
import { connection, sweepQueue } from '../lib/queue'
import { runSweep } from '../services/sweep.service'

// Process sweep jobs
const sweepWorker = new Worker(
  'sweep',
  async (job: Job) => {
    console.log(`Running sweep job ${job.id}`)
    await runSweep()
  },
  { connection }
)

sweepWorker.on('completed', (job) => {
  console.log(`Sweep job ${job.id} completed`)
})

sweepWorker.on('failed', (job, err) => {
  console.error(`Sweep job ${job?.id} failed:`, err.message)
})

// Schedule sweep every 5 minutes
export async function startSweepWorker(): Promise<void> {
  // Clear existing repeatable jobs to avoid duplicates on restart
  const repeatableJobs = await sweepQueue.getRepeatableJobs()
  for (const job of repeatableJobs) {
    await sweepQueue.removeRepeatableByKey(job.key)
  }

  await sweepQueue.add(
    'run-sweep',
    {},
    {
      repeat: { every: 300000 }, // every 5 minutes
      removeOnComplete: 5,
      removeOnFail: 5,
    }
  )

  console.log('Sweep worker started — running every 5 minutes')
}

export { sweepWorker }