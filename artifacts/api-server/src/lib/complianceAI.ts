import OpenAI from 'openai'
import { logger } from './logger.js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type RiskLevel = 'RED' | 'AMBER' | 'GREEN'

export interface WorkerRiskScore {
  workerId: string
  workerName: string
  riskLevel: RiskLevel
  score: number // 0-100, higher = more risk
  reasons: string[]
  recommendations: string[]
  expiringDocuments: ExpiringDoc[]
  analysedAt: string
}

export interface ExpiringDoc {
  document: string
  expiryDate: string
  daysRemaining: number
  severity: RiskLevel
}

function getDaysRemaining(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const expiry = new Date(dateStr)
  const today = new Date()
  const diff = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}

function classifyExpiry(days: number | null): RiskLevel {
  if (days === null) return 'RED'
  if (days < 0) return 'RED'
  if (days <= 30) return 'RED'
  if (days <= 60) return 'AMBER'
  return 'GREEN'
}

export function calculateBasicRisk(worker: any): ExpiringDoc[] {
  const documents = [
    { key: 'medicalExamExpiry', label: 'Medical Examination' },
    { key: 'workDeclarationExpiry', label: 'Work Declaration' },
    { key: 'certificationExpiry', label: 'Welding Certification (EN ISO 9606)' },
    { key: 'visaExpiry', label: 'Visa / Work Permit' },
    { key: 'zusStatus', label: 'ZUS Registration' },
    { key: 'gdprConsentDate', label: 'GDPR Consent' },
    { key: 'liftingCertExpiry', label: 'Lifting Equipment Certificate' },
    { key: 'nationalIdExpiry', label: 'National ID' },
  ]

  const expiring: ExpiringDoc[] = []

  for (const doc of documents) {
    const dateVal = worker[doc.key]
    const days = getDaysRemaining(dateVal)
    const severity = classifyExpiry(days)

    if (severity !== 'GREEN') {
      expiring.push({
        document: doc.label,
        expiryDate: dateVal ?? 'Not provided',
        daysRemaining: days ?? -999,
        severity,
      })
    }
  }

  return expiring
}

export async function scoreWorkerRisk(worker: any): Promise<WorkerRiskScore> {
  const expiringDocuments = calculateBasicRisk(worker)

  const redCount = expiringDocuments.filter(d => d.severity === 'RED').length
  const amberCount = expiringDocuments.filter(d => d.severity === 'AMBER').length

  // Calculate base score without AI
  const baseScore = Math.min(100, redCount * 30 + amberCount * 15)
  const baseRisk: RiskLevel = redCount > 0 ? 'RED' : amberCount > 0 ? 'AMBER' : 'GREEN'

  // Use AI for deeper analysis if OpenAI key is available
  if (process.env.OPENAI_API_KEY) {
    try {
      const prompt = `You are a Polish labor compliance expert. Analyse this worker's compliance status and provide a risk assessment.

Worker: ${worker.name ?? 'Unknown'}
Role: ${worker.specialization ?? 'Not specified'}
Expiring/Missing Documents: ${JSON.stringify(expiringDocuments, null, 2)}
Red flags: ${redCount}, Amber warnings: ${amberCount}

Respond in JSON with this exact structure:
{
  "score": <number 0-100>,
  "riskLevel": "<RED|AMBER|GREEN>",
  "reasons": ["<reason1>", "<reason2>"],
  "recommendations": ["<action1>", "<action2>"]
}`

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      })

      const aiResult = JSON.parse(response.choices[0].message.content ?? '{}')

      return {
        workerId: worker.id ?? worker.airtableId ?? 'unknown',
        workerName: worker.name ?? 'Unknown',
        riskLevel: aiResult.riskLevel ?? baseRisk,
        score: aiResult.score ?? baseScore,
        reasons: aiResult.reasons ?? [],
        recommendations: aiResult.recommendations ?? [],
        expiringDocuments,
        analysedAt: new Date().toISOString(),
      }
    } catch (err) {
      logger.warn({ err }, 'OpenAI analysis failed, falling back to basic scoring')
    }
  }

  // Fallback: rule-based scoring
  const reasons = expiringDocuments.map(d =>
    d.daysRemaining < 0
      ? `${d.document} expired ${Math.abs(d.daysRemaining)} days ago`
      : `${d.document} expires in ${d.daysRemaining} days`
  )

  const recommendations = expiringDocuments.map(d =>
    `Renew ${d.document} immediately`
  )

  return {
    workerId: worker.id ?? worker.airtableId ?? 'unknown',
    workerName: worker.name ?? 'Unknown',
    riskLevel: baseRisk,
    score: baseScore,
    reasons,
    recommendations,
    expiringDocuments,
    analysedAt: new Date().toISOString(),
  }
}

export async function scoreAllWorkers(workers: any[]): Promise<{
  summary: { red: number; amber: number; green: number; total: number }
  workers: WorkerRiskScore[]
}> {
  const scores = await Promise.all(workers.map(w => scoreWorkerRisk(w)))

  const summary = {
    red: scores.filter(s => s.riskLevel === 'RED').length,
    amber: scores.filter(s => s.riskLevel === 'AMBER').length,
    green: scores.filter(s => s.riskLevel === 'GREEN').length,
    total: scores.length,
  }

  // Sort by risk: RED first, then AMBER, then GREEN
  scores.sort((a, b) => b.score - a.score)

  return { summary, workers: scores }
}
