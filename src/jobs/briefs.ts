import cron from 'node-cron'
import { supabase } from '../lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
const ai=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY!})
const TICKERS=['ENELCHILE.SN','COLBUN.SN'], NIVELES=['principiante','intermedio','experto'] as const, AVTS=['guardian','cazador','arquitecto','activista','lector'] as const
async function genBrief(ticker:string,avatar:string,nivel:string,fecha:string) {
  const {data:ex}=await supabase.from('daily_briefs').select('id').eq('fecha',fecha).eq('ticker',ticker).eq('avatar',avatar).eq('nivel',nivel).single()
  if(ex) return
  const {data:km}=await supabase.from('financial_data').select('date,data').eq('ticker',ticker).eq('collection','KeyMetrics').order('date',{ascending:false}).limit(2)
  const r=await ai.messages.create({model:'claude-sonnet-4-5',max_tokens:1024,messages:[{role:'user',content:`Brief diario ${fecha} para ${ticker}, avatar ${avatar}, nivel ${nivel}. Datos: ${JSON.stringify(km||[])}. JSON: {"titular":"...","kicker":"...","cuerpo":"...","cita_avatar":"..."}`}]})
  const text=r.content.filter(b=>b.type==='text').map(b=>(b as any).text).join('')
  const m=text.match(/\{[\s\S]*\}/)
  if(!m) return
  await supabase.from('daily_briefs').insert({fecha,ticker,avatar,nivel,...JSON.parse(m[0]),tokens_used:r.usage.input_tokens+r.usage.output_tokens})
  console.log(`Brief OK: ${fecha}|${ticker}|${avatar}|${nivel}`)
}
export function startBriefsCron() {
  cron.schedule('0 5 * * *', async () => {
    const fecha=new Date().toISOString().split('T')[0]
    for(const t of TICKERS) for(const a of AVTS) for(const n of NIVELES) { await genBrief(t,a,n,fecha); await new Promise(r=>setTimeout(r,800)) }
  },{timezone:'America/Santiago'})
  console.log('Cron briefs: 02:00 AM Santiago')
}