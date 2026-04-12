import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { supabase } from '../lib/supabase'
const router = Router()
router.get('/financials', requireAuth, async (req: Request, res: Response) => {
  const { ticker, collection, limit='8' } = req.query as Record<string,string>
  if (!ticker||!collection) return res.status(400).json({ error: 'ticker y collection requeridos' })
  const maxR: Record<string,number> = { free:4,basico:20,pro:40,full:200,asesor:200 }
  const lim = Math.min(parseInt(limit), maxR[req.user!.plan]||4)
  const { data } = await supabase.from('financial_data').select('date,period,year,data').eq('ticker',ticker).eq('collection',collection).order('date',{ascending:false}).limit(lim)
  res.json({ items: data||[], ticker, collection })
})
router.get('/price', requireAuth, async (req: Request, res: Response) => {
  const { ticker } = req.query as Record<string,string>
  if (!ticker) return res.status(400).json({ error: 'ticker requerido' })
  const today = new Date().toISOString().split('T')[0]
  const { data: cached } = await supabase.from('market_prices').select('*').eq('ticker',ticker).eq('fecha',today).single()
  if (cached) return res.json(cached)
  const fmpRes = await fetch(`https://financialmodelingprep.com/api/v3/quote/${ticker.replace('.SN','')}?apikey=${process.env.FMP_API_KEY}`)
  const fmpData = await fmpRes.json() as any[]
  if (!fmpData?.length) return res.status(404).json({ error: 'No encontrado' })
  const q=fmpData[0], record = { ticker, fecha:today, precio:q.price, apertura:q.open, maximo:q.dayHigh, minimo:q.dayLow, volumen:q.volume, variacion:q.changesPercentage }
  await supabase.from('market_prices').upsert(record, { onConflict: 'ticker,fecha' })
  res.json(record)
})
router.get('/tickers', requireAuth, (_,res) => res.json({ tickers: [{ticker:'ENELCHILE.SN',nombre:'Enel Chile S.A.',sector:'Energia',indice:'IPSA'},{ticker:'COLBUN.SN',nombre:'Colbun S.A.',sector:'Energia',indice:'IPSA'}] }))
export default router