import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { supabase, hashToken, hashIP } from '../lib/supabase'
const router = Router()
const PLAN_IDS: Record<string,string> = { 'eddd2438-5aa5-4959-b553-9de3a3fea74a':'basico','842389c0-1dfd-4604-9a1b-84acb2aa6bf4':'pro','916af65c-3da9-426f-8960-7eafb559ede0':'full' }
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { memberId } = req.query as Record<string,string>
    if (!memberId) return res.status(400).json({ error: 'memberId requerido' })
    const wixRes = await fetch(`https://www.wixapis.com/pricing-plans/v2/member-orders?memberId=${memberId}&planStatuses=ACTIVE`, { headers: { 'Authorization': process.env.WIX_API_KEY!, 'wix-site-id': process.env.WIX_SITE_ID! } })
    const wixData = await wixRes.json() as any
    const activeOrder = (wixData.orders||[]).find((o: any) => PLAN_IDS[o.planId])
    const plan = activeOrder ? PLAN_IDS[activeOrder.planId] : 'free'
    const { data: user } = await supabase.from('users').upsert({ wix_member_id: memberId, email: `${memberId}@sw.cl`, plan, updated_at: new Date().toISOString() }, { onConflict: 'wix_member_id' }).select('id,plan,role').single()
    if (!user) return res.status(500).json({ error: 'Error creando usuario' })
    const token = jwt.sign({ sub: user.id, plan: user.plan, role: user.role }, process.env.JWT_SECRET!, { expiresIn: '7d' })
    await supabase.from('sessions').insert({ user_id: user.id, token_hash: hashToken(token), device_type: 'web', ip_hash: hashIP(req.ip||''), active: true, expires_at: new Date(Date.now()+7*24*60*60*1000).toISOString() })
    res.redirect(`${process.env.CORS_ORIGIN}?token=${token}`)
  } catch { res.status(500).json({ error: 'Error de autenticacion' }) }
})
router.post('/logout', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ','')
  if (token) await supabase.from('sessions').update({ active: false }).eq('token_hash',hashToken(token))
  res.json({ ok: true })
})
router.get('/me', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ','')
  if (!token) return res.status(401).json({ error: 'No autenticado' })
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any
    const { data: user } = await supabase.from('users').select('id,plan,role,knowledge_level,email,onboarding_done').eq('id',payload.sub).single()
    res.json({ user })
  } catch { res.status(401).json({ error: 'Token invalido' }) }
})
export default router