import { prisma } from '../lib/prisma'
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requestPayout } from '../services/payout.service'

const payoutSchema = z.object({
  toAddress: z.string().startsWith('0x'),
  amount: z.string(),
})

export default async function payoutRoutes(app: FastifyInstance) {

  // POST /api/payouts — protected
  app.post('/', {
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const result = payoutSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() })
    }

    try {
      const { userId } = request.user as { userId: string }
      const { toAddress, amount } = result.data
      const payout = await requestPayout(userId, toAddress, amount)
      return reply.status(201).send(payout)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // GET /api/payouts/transactions — get user transaction history
  app.get('/transactions', {
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    })
    return reply.send(transactions)
  })
}