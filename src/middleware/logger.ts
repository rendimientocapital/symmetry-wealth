import { Request, Response, NextFunction } from 'express'
export function logger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  res.on('finish', () => console.log(JSON.stringify({ level: res.statusCode>=400?'ERROR':'INFO', method: req.method, path: req.path, status: res.statusCode, ms: Date.now()-start, user_id: (req as any).user?.id||null })))
  next()
}