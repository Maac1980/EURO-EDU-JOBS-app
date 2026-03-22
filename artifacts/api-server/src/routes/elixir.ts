import { Router } from 'express'
import { generateElixirFile, generateElixirSummary } from '../lib/elixir.js'
import { authenticateToken, requireAdmin } from '../lib/authMiddleware.js'
import { logger } from '../lib/logger.js'

const router = Router()

// POST /api/elixir/generate
// Body: { payrollRecords: [], companyAccountNRB: "PL...", paymentDate: "2026-03-22" }
router.post('/elixir/generate', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { payrollRecords, companyAccountNRB, paymentDate } = req.body

    if (!Array.isArray(payrollRecords) || payrollRecords.length === 0) {
      return res.status(400).json({ error: 'payrollRecords array is required' })
    }

    if (!companyAccountNRB) {
      return res.status(400).json({ error: 'companyAccountNRB is required' })
    }

    const date = paymentDate ? new Date(paymentDate) : new Date()
    const elixirContent = generateElixirFile(payrollRecords, companyAccountNRB, date)
    const summary = generateElixirSummary(payrollRecords)

    const filename = `EEJ_ELIXIR_${date.toISOString().slice(0, 10)}.txt`

    logger.info({ totalWorkers: summary.totalWorkers, totalAmount: summary.totalAmount }, 'ELIXIR file generated')

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(elixirContent)

  } catch (err) {
    logger.error({ err }, 'ELIXIR generation failed')
    res.status(500).json({ error: 'Failed to generate ELIXIR file' })
  }
})

// POST /api/elixir/summary
// Preview total amount before generating file
router.post('/elixir/summary', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { payrollRecords } = req.body

    if (!Array.isArray(payrollRecords)) {
      return res.status(400).json({ error: 'payrollRecords array is required' })
    }

    const summary = generateElixirSummary(payrollRecords)
    res.json(summary)

  } catch (err) {
    logger.error({ err }, 'ELIXIR summary failed')
    res.status(500).json({ error: 'Failed to generate summary' })
  }
})

export default router
