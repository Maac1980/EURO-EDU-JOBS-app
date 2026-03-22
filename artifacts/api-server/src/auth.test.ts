import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'

const JWT_SECRET = 'test-secret-key-for-testing-only'

describe('Authentication', () => {
  it('generates a valid JWT token', () => {
    const payload = { id: '123', email: 'test@eej.com', role: 'T3' }
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
  })

  it('verifies a valid JWT token', () => {
    const payload = { id: '123', email: 'test@eej.com', role: 'T2' }
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
    const decoded = jwt.verify(token, JWT_SECRET) as any
    expect(decoded.id).toBe('123')
    expect(decoded.role).toBe('T2')
  })

  it('rejects an expired token', () => {
    const token = jwt.sign({ id: '123' }, JWT_SECRET, { expiresIn: '-1s' })
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow('jwt expired')
  })

  it('rejects a tampered token', () => {
    const token = jwt.sign({ id: '123', role: 'T4' }, JWT_SECRET)
    const tampered = token.slice(0, -5) + 'xxxxx'
    expect(() => jwt.verify(tampered, JWT_SECRET)).toThrow()
  })

  it('T1 has highest privilege level', () => {
    const roleLevel = (role: string) => 5 - parseInt(role[1])
    expect(roleLevel('T1')).toBeGreaterThan(roleLevel('T2'))
    expect(roleLevel('T2')).toBeGreaterThan(roleLevel('T3'))
    expect(roleLevel('T3')).toBeGreaterThan(roleLevel('T4'))
  })
})
