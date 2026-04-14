import cron from 'node-cron'
import { supabase } from '../lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const TICKERS  = ['CHILE.SN', 'BSANTANDER.SN'] as const
const NIVELES  = ['principiante', 'intermedio', 'experto'] as const
const AVATARES = ['guardian', 'cazador', 'arquitecto', 'activista', 'lector'] as const

const AVATAR_PROMPTS: Record<string, string> = {
  guardian:    'Eres El Guardián del Valor, inspirado en Benjamin Graham y Warren Buffett. Analizas desde la perspectiva del value investing clásico: margen de seguridad, P/E histórico, deuda/equity y moat. Tono conservador, educativo, nunca prescriptivo.',
  cazador:     'Eres El Cazador de Crecimiento, inspirado en Peter Lynch. Analizas con enfoque GARP: PEG ratio, crecimiento de ventas y ROIC. Entusiasta pero riguroso, educativo, nunca prescriptivo.',
  arquitecto:  'Eres El Arquitecto de Portafolios, inspirado en Markowitz. Analizas desde la perspectiva cuantitativa: correlaciones, diversificación, eficiencia del portafolio. Analítico, preciso, educativo, nunca prescriptivo.',
  activista:   'Eres El Activista Paciente, inspirado en Bill Ackman. Analizas con alta convicción: FCF yield, catalizadores y valor oculto. Directo y analítico, educativo, nunca prescriptivo.',
  lector:      'Eres El Lector del Ciclo, experto en macro y renta fija chilena. Analizas: TPM, IPC, spread UF y ciclo económico de Chile. Contextualizado, educativo, nunca prescriptivo.',
}

const NIVEL_INSTRUCCIONES: Record<string, string> = {
  principiante: 'Usa lenguaje simple, sin jerga financiera. Máximo 3 párrafos cortos. Explica cada concepto que menciones.',
  intermedio:   'Usa terminología financiera básica con contexto. 3-4 párrafos. Puedes mencionar ratios pero explícalos brevemente.',
  experto:      'Usa terminología técnica completa. 4-5 párrafos. Profundidad analítica, cita métricas específicas.',
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
  const CAMPOS = ['utilidad_neta','total_ingresos_operacionales','provisiones_riesgo_credito','ingreso_neto_intereses']
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

  const prompt = AVATAR_PROMPTS[avatar] + `\n\nGenera un brief diario de análisis financiero para ${ticker} con fecha ${fecha}.\nNivel del usuario: ${nivel}. ${NIVEL_INSTRUCCIONES[nivel]}\n\nDatos financieros disponibles (últimos períodos):\nKey Metrics: ${JSON.stringify(km.slice(0, 12))}\nResultados destacados: ${JSON.stringify(is.slice(0, 8))}\n\nResponde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:\n{\n  "titular": "Título editorial impactante (máx 80 chars)",\n  "kicker": "Subtítulo contextual (máx 120 chars)",\n  "cuerpo": "Análisis principal según el nivel del usuario",\n  "cita_avatar": "Una frase breve y característica del avatar (máx 100 chars)",\n  "metricas_destacadas": ["métrica1: valor", "métrica2: valor", "métrica3: valor"]\n}`

  const r = await ai.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
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
  console.log(`Brief OK: ${fecha}|${ticker}|${avatar}|${nivel}`)
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
