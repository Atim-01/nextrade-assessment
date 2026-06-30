import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'

export default async function depositRoutes(app: FastifyInstance) {

  // GET /api/deposits/address — returns user's deposit address
  app.get('/address', {
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    try {
      const { userId } = request.user as { userId: string }

      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      })

      if (!wallet) {
        return reply.status(404).send({ error: 'Wallet not found' })
      }

      return reply.send({
        depositAddress: wallet.address,
        network: 'Base Sepolia',
        chainId: process.env.CHAIN_ID,
        note: 'Send ETH to this address. Balance will be credited after 2 confirmations.'
      })
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // GET /api/deposits/transactions — deposit history
  app.get('/transactions', {
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    try {
      const { userId } = request.user as { userId: string }

      const transactions = await prisma.transaction.findMany({
        where: { userId, type: 'DEPOSIT' },
        orderBy: { createdAt: 'desc' }
      })

      return reply.send(transactions)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })
}