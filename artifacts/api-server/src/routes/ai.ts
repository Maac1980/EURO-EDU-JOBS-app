import { Router } from 'express'
import { scoreWorkerRisk, scoreAllWorkers } from '../lib/complianceAI.js'
import { logger } from '../lib/logger.js'

const router = Router()

// Score a single worker's compliance risk
router.get('/ai/risk/:workerId', async (req, res) => {
  try {
    const { workerId } = req.params

    // Get worker data from request or mock for now
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

// Score all workers at once
router.post('/ai/risk/batch', async (req, res) => {
  try {
    const { workers } = req.body

    if (!Array.isArray(workers) || workers.length === 0) {
      return res.status(400).json({ error: 'workers array is required' })
    }

    if (workers.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 workers per batch' })
    }

    const result = await scoreAllWorkers(workers)
    res.json(result)
  } catch (err) {
    logger.error({ err }, 'Failed to score workers batch')
    res.status(500).json({ error: 'Failed to calculate risk scores' })
  }
})

// Get risk summary for dashboard
router.post('/ai/risk/summary', async (req, res) => {
  try {
    const { workers } = req.body

    if (!Array.isArray(workers)) {
      return res.status(400).json({ error: 'workers array is required' })
    }

    const result = await scoreAllWorkers(workers)

    res.json({
      summary: result.summary,
      topRisks: result.workers.slice(0, 10), // Top 10 highest risk workers
      analysedAt: new Date().toISOString(),
    })
  } catch (err) {
    logger.error({ err }, 'Failed to generate risk summary')
    res.status(500).json({ error: 'Failed to generate risk summary' })
  }
})

export default router
