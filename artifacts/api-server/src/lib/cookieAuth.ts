import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { logger } from './logger.js'

const JWT_SECRET = process.env.JWT_SECRET!
const COOKIE_NAME = 'eej_token'

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 24 * 60 * 60 * 1000,
  path: '/',
}

export function setAuthCookie(res: Response, payload: object) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS)
  return token
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' })
}

export function cookieAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME] ?? extractBearerToken(req)

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    ;(req as any).user = decoded
    next()
  } catch (err) {
    logger.warn({ err }, 'Invalid token attempt')
    clearAuthCookie(res)
    return res.status(401).json({ error: 'Session expired, please log in again' })
  }
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}
