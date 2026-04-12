import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const url = process.env.SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_KEY!

export const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip + process.env.JWT_SECRET!).digest('hex')
}