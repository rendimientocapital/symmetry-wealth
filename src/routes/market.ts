import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { supabase } from '../lib/supabase'

const router = Router()

const PLAN_LIMITS: Record<string, number> = {
  free: 4, basico: 20, pro: 40, full: 80, asesor: 80,
}

// GET /market/financials?ticker=CHILE.SN&collection=income_statement&periodo_tipo=ytd
router.get('/financials', async (req: Request, res: Response) => {
  const { ticker, collection, periodo_tipo = 'ytd', limit } = req.query as Record<string, string>
  if (!ticker || !collection) return res.status(400).json({ error: 'ticker y collection requeridos' })

  const maxRows = Math.min(
    parseInt(limit || '400'),
    PLAN_LIMITS[req.user?.plan || 'free'] || 80
  )

  const { data, error } = await supabase
    .from('financial_data')
    .select('ticker, periodo, year, quarter, mes, collection, field, value, moneda, periodo_tipo')
    .eq('ticker', ticker)
    .eq('collection', collection)
    .eq('periodo_tipo', periodo_tipo)
    .order('year', { ascending: false })
    .order('mes', { ascending: false })
    .limit(maxRows * 25)

  if (error) return res.status(500).json({ error: error.message })

  const byPeriodo: Record<string, any> = {}
  for (const row of data || []) {
    if (!byPeriodo[row.periodo]) {
      byPeriodo[row.periodo] = {
        periodo: row.periodo, year: row.year,
        quarter: row.quarter, mes: row.mes, fields: {},
      }
    }
    byPeriodo[row.periodo].fields[row.field] = { value: row.value, moneda: row.moneda }
  }

  res.json({
    ticker, collection, periodo_tipo,
    items: Object.values(byPeriodo).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.mes - a.mes
    ),
  })
})

// GET /market/key-metrics?ticker=CHILE.SN
router.get('/key-metrics', async (req: Request, res: Response) => {
  const { ticker } = req.query as Record<string, string>
  if (!ticker) return res.status(400).json({ error: 'ticker requerido' })

  const maxPeriodos = PLAN_LIMITS[req.user?.plan || 'free'] || 80

  const { data, error } = await supabase
    .from('financial_data')
    .select('periodo, year, mes, field, value, moneda')
    .eq('ticker', ticker)
    .eq('collection', 'key_metrics')
    .eq('periodo_tipo', 'ytd')
    .order('year', { ascending: false })
    .order('mes', { ascending: false })
    .limit(maxPeriodos * 10)

  if (error) return res.status(500).json({ error: error.message })

  const byPeriodo: Record<string, any> = {}
  for (const row of data || []) {
    if (!byPeriodo[row.periodo]) byPeriodo[row.periodo] = { periodo: row.periodo, year: row.year, mes: row.mes, metrics: {} }
    byPeriodo[row.periodo].metrics[row.field] = row.value
  }

  res.json({ ticker, items: Object.values(byPeriodo) })
})

// GET /market/briefs?ticker=CHILE.SN&avatar=guardian&nivel=intermedio
router.get('/briefs', async (req: Request, res: Response) => {
  const { ticker, avatar, nivel, fecha } = req.query as Record<string, string>
  if (!ticker || !avatar || !nivel) return res.status(400).json({ error: 'ticker, avatar y nivel requeridos' })

  let query = supabase
    .from('daily_briefs')
    .select('*')
    .eq('ticker', ticker).eq('avatar', avatar).eq('nivel', nivel)
    .order('fecha', { ascending: false })
    .limit(1)

  if (fecha) query = query.eq('fecha', fecha)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  if (!data?.length) return res.status(404).json({ error: 'Brief no encontrado' })

  res.json(data[0])
})

// GET /market/price?ticker=CHILE.SN
router.get('/price', async (req: Request, res: Response) => {
  const { ticker } = req.query as Record<string, string>
  if (!ticker) return res.status(400).json({ error: 'ticker requerido' })

  try {
    const apiKey = process.env.FMP_API_KEY
    const symbol = ticker.replace('.SN', '')
    const r = await fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`)
    const json = await r.json() as any[]
    if (!json?.length) return res.status(404).json({ error: 'Precio no disponible' })
    const q = json[0]
    res.json({
      ticker, symbol: q.symbol,
      price: q.price, change: q.change, changesPercentage: q.changesPercentage,
      open: q.open, dayLow: q.dayLow, dayHigh: q.dayHigh,
      volume: q.volume, marketCap: q.marketCap, timestamp: q.timestamp,
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})


// GET /market/historical-prices?ticker=CHILE.SN
router.get('/historical-prices', async (req: Request, res: Response) => {
  const { ticker } = req.query as Record<string, string>
  if (!ticker) return res.status(400).json({ error: 'ticker requerido' })

  const { data, error } = await supabase
    .from('market_prices')
    .select('periodo, year, mes, quarter, fecha, precio')
    .eq('ticker', ticker)
    .not('periodo', 'is', null)
    .order('year', { ascending: true })
    .order('mes', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ticker, items: data || [] })
})

export default router
