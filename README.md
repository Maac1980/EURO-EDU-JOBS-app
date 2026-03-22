# EURO EDU JOBS (EEJ)

A comprehensive international recruitment and compliance management platform for managing workers across European markets, with deep Polish labor law compliance automation.

## What It Does

- Tracks worker compliance documents (visas, medical exams, work permits, certifications)
- Automates Polish ZUS calculations and payroll processing
- Sends daily compliance alerts via email and WhatsApp
- AI-powered risk scoring (Red/Amber/Green) for every worker
- Role-based access for executives, legal, operations, and workers

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS v4, Radix UI
- **Backend:** Express 5, Node.js 24, TypeScript
- **Database:** SQLite + Airtable
- **Auth:** JWT httpOnly cookies, OTP email, TOTP 2FA
- **AI:** OpenAI GPT-4o-mini for compliance risk scoring
- **Notifications:** Resend/Nodemailer email, Twilio WhatsApp/SMS

## Quick Start

\`\`\`bash
pnpm install
pnpm run dev
\`\`\`

## Tests

\`\`\`bash
cd artifacts/api-server && npx vitest run
\`\`\`

## User Roles

| Role | Access |
|------|--------|
| T1 Executive | Full system access |
| T2 Legal | Compliance and documents |
| T3 Operations | Workers and payroll |
| T4 Worker | Self-service portal |
