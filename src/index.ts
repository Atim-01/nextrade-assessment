import './lib/env'
import Fastify from 'fastify'
import fjwt from '@fastify/jwt'
import { env } from './lib/env'
import { prisma } from './lib/prisma'
import userRoutes from './routes/users'
import depositRoutes from './routes/deposits'
import payoutRoutes from './routes/payouts'

const app = Fastify({ logger: true })

// JWT plugin
app.register(fjwt, { secret: env.JWT_SECRET })

// Auth decorator — protects routes that need a logged-in user
app.decorate('authenticate', async function (request: any, reply: any) {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' })
  }
})

// Routes
app.register(userRoutes, { prefix: '/api/users' })
app.register(depositRoutes, { prefix: '/api/deposits' })
app.register(payoutRoutes, { prefix: '/api/payouts' })

// Health check
app.get('/health', async () => ({ status: 'ok' }))

// Graceful shutdown
const start = async () => {
  try {
    await app.listen({ port: Number(env.PORT), host: '0.0.0.0' })
    console.log(`Server running on port ${env.PORT}`)
  } catch (err) {
    app.log.error(err)
    await prisma.$disconnect()
    process.exit(1)
  }
}

start()