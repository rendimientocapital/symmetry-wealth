import { Router, Request, Response } from 'express'
import { requireAuth, requirePlan } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
const router = Router()
const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
router.get('/briefs', requireAuth, async (req,res) => {
  const { fecha, ticker, avatar } = req.query as Record<string,string>
  const hoy = fecha||new Date().toISOString().split('T')[0]
  let q = supabase.from('daily_briefs').select('*').eq('fecha',hoy).eq('nivel',req.user!.knowledge_level)
  if (ticker) q=q.eq('ticker',ticker)
  if (avatar) q=q.eq('avatar',avatar)
  if (req.user!.role!=='asesor') q=q.neq('avatar','trazador')
  const { data } = await q
  res.json({ briefs: data||[], fecha: hoy })
})
router.post('/ask', requireAuth, requirePlan('basico','pro','full','asesor'), async (req,res) => {
  try {
    const { pregunta, ticker, avatar='guardian' } = req.body
    if (!pregunta) return res.status(400).json({ error: 'pregunta requerida' })
    if (avatar==='trazador'&&req.user!.role!=='asesor') return res.status(403).json({ error: 'El Trazador es exclusivo para asesores' })
    const r = await ai.messages.create({ model:'claude-sonnet-4-5', max_tokens:2048, messages:[{role:'user',content:pregunta}] })
    const text = r.content.filter(b=>b.type==='text').map(b=>(b as any).text).join('')
    await supabase.from('conversations').insert({ user_id:req.user!.id, pregunta, respuesta:text, ticker, avatar, tokens_in:r.usage.input_tokens, tokens_out:r.usage.output_tokens })
    res.json({ respuesta:text, avatar })
  } catch { res.status(500).json({ error: 'Error procesando consulta' }) }
})
export default router