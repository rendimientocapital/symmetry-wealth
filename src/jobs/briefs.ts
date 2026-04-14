import cron from 'node-cron'
import { supabase } from '../lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const TICKERS  = ['CHILE.SN', 'BSANTANDER.SN'] as const
const NIVELES  = ['principiante', 'intermedio', 'experto'] as const
const AVATARES = ['guardian', 'cazador', 'arquitecto', 'activista', 'lector'] as const

const AVATAR_SYSTEM: Record<string, string> = {
  guardian:    'Eres El Guardián del Valor, inspirado en Graham y Buffett. Tu filosofía: margen de seguridad, calidad del negocio, paciencia. Tono: sereno, riguroso, con convicciones fuertes pero sin apresuramiento.',
  cazador:     'Eres El Cazador de Crecimiento, inspirado en Peter Lynch. Tu filosofía: crecimiento a precio razonable (GARP), conocer el negocio en profundidad. Tono: entusiasta, curioso, narrativo.',
  arquitecto:  'Eres El Arquitecto de Portafolios, inspirado en Markowitz. Tu filosofía: números, correlaciones, eficiencia del portafolio. Tono: analítico, preciso, estructurado.',
  activista:   'Eres El Activista Paciente, inspirado en Bill Ackman. Tu filosofía: alta convicción, catalizadores, FCF. Tono: directo, contundente, busca lo que el mercado no ve.',
  lector:      'Eres El Lector del Ciclo, experto en macro chilena y renta fija. Tu filosofía: el ciclo económico lo explica todo. Tono: contextual, conecta datos macro con el activo específico.',
}

const NIVEL_PROMPT: Record<string, string> = {
  principiante: `NIVEL PRINCIPIANTE — EDUCATIVO Y DIDÁCTICO:
El lector sabe poco de finanzas. Cada término técnico que uses, explícalo en la misma oración con una analogía simple.
Ejemplo: "El P/E (o ratio precio-ganancia) está en 12x — significa que pagas 12 años de ganancias actuales por la acción."
Estructura: empieza con qué pasó, luego por qué importa, luego qué significa para alguien que invierte.
Usa comparaciones con cosas cotidianas. Nunca asumas que el lector sabe qué es ROE, NIM, UPA, NII u otro ratio.
Objetivo: que el lector entienda y aprenda algo nuevo. Didáctico siempre.`,

  intermedio: `NIVEL INTERMEDIO — TÉCNICO CON CONTEXTO:
El lector conoce términos básicos (UPA, ROE, margen neto, provisiones) pero no domina análisis profundo.
Puedes usar jerga financiera sin explicar lo básico, pero sí contextualiza los números: ¿es alto o bajo ese ROE? ¿Cómo compara con el sector o con el período anterior?
Estructura: hecho + contexto + implicancia. Conecta los datos entre sí.
Objetivo: que el lector entienda el cuadro completo, no solo datos sueltos.`,

  experto: `NIVEL EXPERTO — SOLO NARRATIVA Y DATOS:
El lector domina análisis financiero. No expliques nada — asume conocimiento total.
Sin analogías, sin definiciones, sin frases introductorias.
Ve directo a los datos, los ratios, las comparativas con peers, las implicancias de largo plazo.
Cita cifras exactas. Compara períodos. Señala anomalías o divergencias relevantes.
Estructura: tesis → evidencia numérica → implicancias. Denso, preciso, sin relleno.`,
}

async function getFinancialContext(ticker: string) {
  const [{ data: km }, { data: is }, { data: cf }] = await Promise.all([
    supabase.from('financial_data')
      .select('field, value, periodo')
      .eq('ticker', ticker).eq('collection', 'key_metrics')
      .eq('periodo_tipo', 'ytd').order('periodo', { ascending: false }).limit(20),
    supabase.from('financial_data')
      .select('field, value, periodo')
      .eq('ticker', ticker).eq('collection', 'income_statement')
      .eq('periodo_tipo', 'ytd').in('field', [
        'utilidad_neta','total_ingresos_operacionales','ingreso_neto_intereses',
        'ingreso_neto_comisiones','provisiones_riesgo_credito','utilidad_por_accion',
      ]).order('periodo', { ascending: false }).limit(20),
    supabase.from('financial_data')
      .select('field, value, periodo')
      .eq('ticker', ticker).eq('collection', 'cash_flow')
      .eq('periodo_tipo', 'ytd').in('field', [
        'flujo_operacional','free_cash_flow','dividendos_pagados',
      ]).order('periodo', { ascending: false }).limit(12),
  ])
  return { km: km || [], is: is || [], cf: cf || [] }
}

async function genBrief(ticker: string, avatar: string, nivel: string, fecha: string) {
  const { data: existing } = await supabase
    .from('daily_briefs').select('id')
    .eq('fecha', fecha).eq('ticker', ticker).eq('avatar', avatar).eq('nivel', nivel)
    .single()
  if (existing) return

  const ctx = await getFinancialContext(ticker)

  const prompt = `${AVATAR_SYSTEM[avatar]}

TAREA: Genera el brief diario de ${ticker} para la fecha ${fecha}.

${NIVEL_PROMPT[nivel]}

LONGITUD OBLIGATORIA: El cuerpo del brief debe tener entre 550 y 700 palabras.
Esto equivale exactamente a 5 minutos de lectura en mobile.
No menos, no más. Es una regla editorial inamovible.
NUNCA hagas recomendaciones explícitas de compra o venta — solo análisis educativo.

Datos financieros disponibles (últimos períodos):
Income Statement: ${JSON.stringify(ctx.is)}
Key Metrics: ${JSON.stringify(ctx.km)}
Cash Flow: ${JSON.stringify(ctx.cf)}

Responde SOLO con un JSON válido, sin texto antes ni después, sin markdown:
{
  "titular": "Título editorial, máx 75 chars, impactante y específico con datos",
  "kicker": "Subtítulo de contexto, máx 95 chars",
  "cuerpo": "El análisis completo de 550-700 palabras según el nivel y el avatar",
  "cita_avatar": "Frase característica del avatar, máx 85 chars, sin comillas externas",
  "metricas_destacadas": ["métrica clave: valor concreto", "métrica clave: valor concreto", "métrica clave: valor concreto"]
}`

  const r = await ai.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = r.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) { console.error(`Parse error: ${ticker}|${avatar}|${nivel}`); return }

  const parsed = JSON.parse(match[0])
  const wordCount = parsed.cuerpo?.split(' ').length || 0

  await supabase.from('daily_briefs').insert({
    fecha, ticker, avatar, nivel, ...parsed,
    tokens_used: r.usage.input_tokens + r.usage.output_tokens,
  })
  console.log(`Brief OK: ${fecha}|${ticker}|${avatar}|${nivel} | ${wordCount} palabras | ${r.usage.output_tokens} tokens`)
}

export function startBriefsCron() {
  cron.schedule('0 5 * * *', async () => {
    const fecha = new Date().toISOString().split('T')[0]
    console.log(`Generando briefs para ${fecha}...`)
    for (const t of TICKERS)
      for (const a of AVATARES)
        for (const n of NIVELES) {
          await genBrief(t, a, n, fecha)
          await new Promise(r => setTimeout(r, 1200))
        }
    console.log(`Briefs ${fecha} completados`)
  }, { timezone: 'America/Santiago' })
  console.log('Cron briefs: 05:00 AM Santiago (2 × 5 × 3 = 30 briefs/día)')
}
