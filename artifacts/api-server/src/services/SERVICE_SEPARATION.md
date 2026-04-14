# EEJ Service Separation Guide

## Current Architecture

### Pattern A: Separated (Target Pattern — used by new code)
```
routes/   → HTTP handlers only (req/res, auth, validation)
services/ → Business logic (pure functions, DB queries, AI calls)
```

**Files following this pattern:**
- `legal-case-engine.ts` — contains both routes and business logic in clean sections
- `payroll-ledger.ts` — contains both routes and business logic in clean sections
- `notification-engine.ts` — contains both routes and exported functions
- `legal-decision-engine.ts` — PURE function, no routes (exemplary)

### Pattern B: Monolithic (Legacy — works, don't break)
```
services/file.ts → contains Router + business logic + DB + AI in one file
```

**Files following this pattern:**
- `first-contact-verification.ts` (939 lines) — Router + OCR feedback + verification + client/worker endpoints
- `smart-ingest.ts` (588 lines) — Router + Claude Vision + legal engine + KG sync + verification

### Refactoring Plan (Low-Risk, Incremental)

**Phase 1 (Done):** All NEW services follow Pattern A
**Phase 2 (Future):** Extract service functions from smart-ingest.ts:
  - `smart-ingest.service.ts` → `analyzeDocument()`, `verifyDocument()`, `syncToWorker()`
  - `routes/smart-ingest.ts` → HTTP handlers importing from service

**Phase 3 (Future):** Extract from first-contact-verification.ts:
  - `first-contact.service.ts` → `runIngestAudit()`, `runStressTest()`, `logOcrFeedback()`, `verifyWorker()`, `getClientCompliance()`
  - `routes/first-contact.ts` → HTTP handlers importing from service

### Why Not Now
- Both files are **production-tested** and stable
- 1,527 lines of working code is high-risk to refactor right before deployment
- New code (legal-case-engine, payroll-ledger) already follows the target pattern
- Incremental extraction is safer than big-bang refactoring
