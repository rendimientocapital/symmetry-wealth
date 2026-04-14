import cron from 'node-cron'
import { supabase } from '../lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const TICKERS  = ['CHILE.SN', 'BSANTANDER.SN'] as const
const NIVELES  = ['principiante', 'intermedio', 'experto'] as const
const AVATARES = ['guardian', 'cazador', 'arquitecto', 'activista', 'lector'] as const

const AVATAR_PROMPTS: Record<string, string> = {
  guardian:    'Eres El Guardián del Valor (value investing, Graham/Buffett). Directo, conservador, sin adornos.',
  cazador:     'Eres El Cazador de Crecimiento (GARP, Peter Lynch). Entusiasta pero concreto.',
  arquitecto:  'Eres El Arquitecto de Portafolios (cuantitativo, Markowitz). Preciso, datos primero.',
  activista:   'Eres El Activista Paciente (alta convicción, Ackman). Franco, va al punto.',
  lector:      'Eres El Lector del Ciclo (macro y renta fija chilena). Contextual, ciclo primero.',
}

const NIVEL_INSTRUCCIONES: Record<string, string> = {
  principiante: 'Sin jerga. 2 párrafos máximo. Explica cada número brevemente.',
  intermedio:   '3 párrafos cortos. Puedes usar términos como ROE, NII, UPA sin explicarlos.',
  experto:      '3-4 párrafos densos. Datos, ratios, comparativa de peers. Sin relleno.',
}

async function getKeyMetrics(ticker: string) {
  const { data } = await supabase
    .from('financial_data')
    .select('field, value, periodo, moneda')
    .eq('ticker', ticker)
    .eq('collection', 'key_metrics')
    .eq('periodo_tipo', 'ytd')
    .order('periodo', { ascending: false })
    .limit(24)
  return data || []
}

async function getIncomeHighlights(ticker: string) {
  const CAMPOS = ['utilidad_neta','total_ingresos_operacionales','provisiones_riesgo_credito','ingreso_neto_intereses','utilidad_por_accion']
  const { data } = await supabase
    .from('financial_data')
    .select('field, value, periodo')
    .eq('ticker', ticker)
    .eq('collection', 'income_statement')
    .eq('periodo_tipo', 'ytd')
    .in('field', CAMPOS)
    .order('periodo', { ascending: false })
    .limit(16)
  return data || []
}

async function genBrief(ticker: string, avatar: string, nivel: string, fecha: string) {
  const { data: existing } = await supabase
    .from('daily_briefs').select('id')
    .eq('fecha', fecha).eq('ticker', ticker).eq('avatar', avatar).eq('nivel', nivel)
    .single()
  if (existing) return

  const [km, is] = await Promise.all([getKeyMetrics(ticker), getIncomeHighlights(ticker)])

  const prompt = AVATAR_PROMPTS[avatar] + `

Brief diario para ${ticker} · ${fecha} · Nivel: ${nivel}
${NIVEL_INSTRUCCIONES[nivel]}

REGLA CRÍTICA DE LONGITUD:
- principiante: máximo 120 palabras en "cuerpo"
- intermedio: máximo 180 palabras en "cuerpo"
- experto: máximo 220 palabras en "cuerpo"
Sé directo. Elimina todo lo que no aporte. El usuario lee en mobile en 3-5 minutos.
NUNCA hagas recomendaciones de compra o venta.

Datos financieros recientes:
${JSON.stringify(is.slice(0, 6))}
${JSON.stringify(km.slice(0, 8))}

Responde SOLO con JSON válido, sin texto antes ni después:
{
  "titular": "máximo 70 chars — impactante y concreto",
  "kicker": "máximo 90 chars — contexto en una línea",
  "cuerpo": "el análisis — corto y al grano según nivel",
  "cita_avatar": "máximo 80 chars — frase característica del avatar",
  "metricas_destacadas": ["métrica: valor", "métrica: valor", "métrica: valor"]
}`

  const r = await ai.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = r.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) { console.error(`Brief parse error: ${ticker}|${avatar}|${nivel}`); return }

  const parsed = JSON.parse(match[0])
  await supabase.from('daily_briefs').insert({
    fecha, ticker, avatar, nivel, ...parsed,
    tokens_used: r.usage.input_tokens + r.usage.output_tokens,
  })
  console.log(`Brief OK: ${fecha}|${ticker}|${avatar}|${nivel} (${r.usage.output_tokens} tokens)`)
}

export function startBriefsCron() {
  cron.schedule('0 5 * * *', async () => {
    const fecha = new Date().toISOString().split('T')[0]
    console.log(`Generando briefs para ${fecha}...`)
    for (const t of TICKERS)
      for (const a of AVATARES)
        for (const n of NIVELES) {
          await genBrief(t, a, n, fecha)
          await new Promise(r => setTimeout(r, 1000))
        }
    console.log(`Briefs ${fecha} completados`)
  }, { timezone: 'America/Santiago' })
  console.log('Cron briefs: 05:00 AM Santiago (2 tickers × 5 avatares × 3 niveles = 30 briefs/día)')
}
