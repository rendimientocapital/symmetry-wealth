import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import { z } from 'zod'
const router = Router()
const PS = z.object({ ticker:z.string().min(1).max(20), nombre:z.string().optional(), sector:z.string().optional(), mercado:z.enum(['CL','CO','PE','US']).default('CL'), cantidad:z.number().positive(), precio_compra:z.number().positive(), regimen:z.enum(['art107','general','exento']).default('art107'), fecha_compra:z.string().optional(), notas:z.string().optional() })
router.get('/', requireAuth, async (req,res) => { const {data}=await supabase.from('positions').select('*').eq('user_id',req.user!.id).is('deleted_at',null).order('created_at',{ascending:false}); res.json({positions:data||[]}) })
router.post('/', requireAuth, async (req,res) => { const p=PS.safeParse(req.body); if(!p.success) return res.status(400).json({error:p.error.issues}); const {data}=await supabase.from('positions').insert({...p.data,user_id:req.user!.id}).select().single(); res.status(201).json({position:data}) })
router.put('/:id', requireAuth, async (req,res) => { const p=PS.partial().safeParse(req.body); if(!p.success) return res.status(400).json({error:p.error.issues}); const {data}=await supabase.from('positions').update({...p.data,updated_at:new Date().toISOString()}).eq('id',req.params.id).eq('user_id',req.user!.id).select().single(); res.json({position:data}) })
router.delete('/:id', requireAuth, async (req,res) => { await supabase.from('positions').update({deleted_at:new Date().toISOString()}).eq('id',req.params.id).eq('user_id',req.user!.id); res.json({ok:true}) })
export default router