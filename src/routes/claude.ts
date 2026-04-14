import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()
const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const userCalls: Record<string, { count: number; reset: number }> = {}
const PLAN_LIMITS: Record<string, number> = { free: 5, basico: 20, pro: 50, full: 150, asesor: 200 }

function checkRateLimit(userId: string, plan: string): boolean {
  const now = Date.now()
  const limit = PLAN_LIMITS[plan] || 5
  if (!userCalls[userId] || userCalls[userId].reset < now) {
    userCalls[userId] = { count: 0, reset: now + 24 * 60 * 60 * 1000 }
  }
  if (userCalls[userId].count >= limit) return false
  userCalls[userId].count++
  return true
}

const AVATAR_SYSTEM: Record<string, string> = {
  guardian:   'Eres El Guardián del Valor, inspirado en Benjamin Graham y Warren Buffett. Value investing clásico: margen de seguridad, P/E histórico, deuda/equity y moat.',
  cazador:    'Eres El Cazador de Crecimiento, inspirado en Peter Lynch. Enfoque GARP: PEG ratio, crecimiento de ventas y ROIC.',
  arquitecto: 'Eres El Arquitecto de Portafolios, inspirado en Markowitz. Perspectiva cuantitativa: correlaciones, diversificación, eficiencia.',
  activista:  'Eres El Activista Paciente, inspirado en Bill Ackman. Alta convicción: FCF yield, catalizadores y valor oculto.',
  lector:     'Eres El Lector del Ciclo, experto en macro y renta fija chilena. Analizas TPM, IPC, spread UF y ciclo económico.',
}

// POST /claude/chat
router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  const { ticker, messages, avatar = 'guardian' } = req.body
  if (!ticker || !messages?.length) return res.status(400).json({ error: 'ticker y messages requeridos' })

  if (!checkRateLimit(req.user!.id, req.user!.plan)) {
    return res.status(429).json({ error: 'Límite diario de consultas alcanzado' })
  }

  const { data: km } = await supabase
    .from('financial_data')
    .select('field, value, periodo, moneda')
    .eq('ticker', ticker)
    .eq('collection', 'key_metrics')
    .eq('periodo_tipo', 'ytd')
    .order('periodo', { ascending: false })
    .limit(20)

  const systemPrompt = (AVATAR_SYSTEM[avatar] || AVATAR_SYSTEM.guardian) + `
Eres parte de Symmetry Wealth, plataforma educativa financiera para el mercado chileno.
Responde siempre en español. Tono educativo e informativo. NUNCA hagas recomendaciones de compra o venta.
Cuando cites datos, menciona el período. Cita fuente como "Estados Financieros CMF".

Datos financieros de ${ticker}: ${JSON.stringify(km || [])}`

  const r = await ai.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.slice(-10),
  })

  const text = r.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
  res.json({ content: text, tokens_used: r.usage.input_tokens + r.usage.output_tokens, avatar })
})

export default router
