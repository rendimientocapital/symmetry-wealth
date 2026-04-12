import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { logger } from './middleware/logger'
import authRouter from './routes/auth'
import marketRouter from './routes/market'
import portfolioRouter from './routes/portfolio'
import claudeRouter from './routes/claude'
import wixWebhook from './webhooks/wix'
import { startBriefsCron } from './jobs/briefs'

const app = express()
const PORT = parseInt(process.env.PORT || '3000')

app.use(helmet())
app.use(cors({ origin: [process.env.CORS_ORIGIN || 'https://app.symmetrygroup.cl', 'https://symmetrygroup.cl', 'http://localhost:3001'], credentials: true }))
app.use(rateLimit({ windowMs: 15*60*1000, max: 200, message: { error: 'Rate limit exceeded' } }))
app.use(logger)
app.use('/webhooks', wixWebhook)
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => res.json({ ok: true, service: 'symmetry-wealth-api', ts: new Date().toISOString() }))
app.use('/auth', authRouter)
app.use('/market', marketRouter)
app.use('/portfolio', portfolioRouter)
app.use('/claude', claudeRouter)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.message)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Symmetry Wealth API en puerto ${PORT}`)
  startBriefsCron()
})

export default app