import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { registerUser, loginUser, getUserBalance } from '../services/user.service'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export default async function userRoutes(app: FastifyInstance) {

  // POST /api/users/register
  app.post('/register', async (request, reply) => {
    const result = registerSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() })
    }

    try {
      const user = await registerUser(result.data.email, result.data.password)
      const token = app.jwt.sign({ userId: user.id, email: user.email })
      return reply.status(201).send({ user, token })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // POST /api/users/login
  app.post('/login', async (request, reply) => {
    const result = registerSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() })
    }

    try {
      const user = await loginUser(result.data.email, result.data.password)
      const token = app.jwt.sign({ userId: user.id, email: user.email })
      return reply.status(200).send({ user, token })
    } catch (err: any) {
      return reply.status(401).send({ error: err.message })
    }
  })

  // GET /api/users/balance — protected
  app.get('/balance', {
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    try {
      const { userId } = request.user as { userId: string }
      const balance = await getUserBalance(userId)
      return reply.send(balance)
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })
}