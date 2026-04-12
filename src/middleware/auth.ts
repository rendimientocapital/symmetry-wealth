import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { supabase, hashToken } from '../lib/supabase'
export interface AuthUser { id: string; plan: string; role: string; knowledge_level: string; email: string }
declare global { namespace Express { interface Request { user?: AuthUser } } }
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ','')
  if (!token) return res.status(401).json({ error: 'Token requerido' })
  try {
    jwt.verify(token, process.env.JWT_SECRET!)
    const { data: session } = await supabase.from('sessions').select('user_id,expires_at,active').eq('token_hash',hashToken(token)).eq('active',true).single()
    if (!session || new Date(session.expires_at)<new Date()) return res.status(401).json({ error: 'Sesion invalida' })
    const { data: user } = await supabase.from('users').select('id,plan,role,knowledge_level,email').eq('id',session.user_id).is('deleted_at',null).single()
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' })
    req.user = user as AuthUser
    next()
  } catch { return res.status(401).json({ error: 'Token invalido' }) }
}
export function requirePlan(...planes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' })
    if (!planes.includes(req.user.plan)) return res.status(403).json({ error: 'Plan insuficiente', upgrade_url: 'https://symmetrygroup.cl/#pricing' })
    next()
  }
}