import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { supabase } from '../lib/supabase'
const router = Router()
const PLAN_IDS: Record<string,string> = { 'eddd2438-5aa5-4959-b553-9de3a3fea74a':'basico','842389c0-1dfd-4604-9a1b-84acb2aa6bf4':'pro','916af65c-3da9-426f-8960-7eafb559ede0':'full' }
function verifySig(body: Buffer, sig: string): boolean {
  try { return crypto.timingSafeEqual(Buffer.from(crypto.createHmac('sha256',process.env.WIX_WEBHOOK_SECRET!).update(body).digest('base64')),Buffer.from(sig)) } catch { return false }
}
router.post('/wix', (req: Request, res: Response) => {
  const chunks: Buffer[]=[]
  req.on('data',c=>chunks.push(c))
  req.on('end', async () => {
    const body=Buffer.concat(chunks), sig=req.headers['x-wix-signature'] as string
    if (!sig||!verifySig(body,sig)) return res.status(401).json({error:'Firma invalida'})
    try {
      const event=JSON.parse(body.toString()), {eventType,data}=event, memberId=data?.buyerMemberId||data?.memberId
      await supabase.from('plan_events').insert({wix_member_id:memberId,event_type:eventType,plan_id:data?.planId,plan_name:PLAN_IDS[data?.planId]||'unknown',order_id:data?.orderId,raw_payload:event,processed:false})
      if (memberId&&(eventType==='ORDER_STARTED'||eventType==='ORDER_UPDATED')) await supabase.from('users').update({plan:PLAN_IDS[data?.planId]||'free',plan_expires_at:data?.endDate||null,updated_at:new Date().toISOString()}).eq('wix_member_id',memberId)
      if (memberId&&(eventType==='ORDER_ENDED'||eventType==='ORDER_CANCELED')) { const {data:u}=await supabase.from('users').update({plan:'free',plan_expires_at:null}).eq('wix_member_id',memberId).select('id').single(); if(u) await supabase.from('sessions').update({active:false}).eq('user_id',u.id) }
      res.json({received:true})
    } catch { res.status(500).json({error:'Error webhook'}) }
  })
})
export default router