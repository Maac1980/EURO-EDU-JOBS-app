import { Router, Request, Response } from 'express'
import { scoreWorkerRisk, scoreAllWorkers } from '../lib/complianceAI.js'
import { logger } from '../lib/logger.js'

const router = Router()

router.get('/ai/risk/:workerId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { workerId } = req.params
    const worker = {
      id: workerId,
      name: req.query.name as string ?? 'Unknown Worker',
      specialization: req.query.specialization as string ?? 'General',
      medicalExamExpiry: req.query.medicalExamExpiry as string,
      workDeclarationExpiry: req.query.workDeclarationExpiry as string,
      certificationExpiry: req.query.certificationExpiry as string,
      visaExpiry: req.query.visaExpiry as string,
      zusStatus: req.query.zusStatus as string,
      gdprConsentDate: req.query.gdprConsentDate as string,
      liftingCertExpiry: req.query.liftingCertExpiry as string,
      nationalIdExpiry: req.query.nationalIdExpiry as string,
    }
    const result = await scoreWorkerRisk(worker)
    res.json(result)
  } catch (err) {
    logger.error({ err }, 'Failed to score worker risk')
    res.status(500).json({ error: 'Failed to calculate risk score' })
  }
})

router.post('/ai/risk/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { workers } = req.body
    if (!Array.isArray(workers) || workers.length === 0) {
      res.status(400).json({ error: 'workers array is required' })
      return
    }
    if (workers.length > 100) {
      res.status(400).json({ error: 'Maximum 100 workers per batch' })
      return
    }
    const result = await scoreAllWorkers(workers)
    res.json(result)
  } catch (err) {
    logger.error({ err }, 'Failed to score workers batch')
    res.status(500).json({ error: 'Failed to calculate risk scores' })
  }
})

router.post('/ai/risk/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const { workers } = req.body
    if (!Array.isArray(workers)) {
      res.status(400).json({ error: 'workers array is required' })
      return
    }
    const result = await scoreAllWorkers(workers)
    res.json({
      summary: result.summary,
      topRisks: result.workers.slice(0, 10),
      analysedAt: new Date().toISOString(),
    })
  } catch (err) {
    logger.error({ err }, 'Failed to generate risk summary')
    res.status(500).json({ error: 'Failed to generate risk summary' })
  }
})

export default router
