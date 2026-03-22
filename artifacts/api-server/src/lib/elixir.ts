import { PayrollRecord } from '../routes/payroll.js'

// ELIXIR 186 format — standard Polish bank transfer file
// Used by PKO BP, Pekao, mBank, ING, Santander Poland

interface ElixirRecord {
  orderType: string        // 110 = credit transfer
  date: string             // YYYYMMDD
  amount: number           // in grosze (1 PLN = 100 grosze)
  bankFrom: string         // 8-digit bank code
  bankTo: string           // 8-digit bank code
  accountFrom: string      // 26-digit NRB
  accountTo: string        // 26-digit NRB
  workerName: string
  title: string            // payment description
}

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function formatAmount(pln: number): string {
  // Convert PLN to grosze, no decimal point
  return String(Math.round(pln * 100)).padStart(10, '0')
}

function extractBankCode(nrb: string): string {
  // NRB format: CC BBBB BBBB XXXX XXXX XXXX XXXX
  // Bank code is digits 3-10 (first 8 after check digits)
  const clean = nrb.replace(/\s/g, '')
  return clean.substring(2, 10)
}

function buildElixirLine(record: ElixirRecord): string {
  // ELIXIR-0 format fields separated by |
  const fields = [
    record.orderType,
    record.date,
    formatAmount(record.amount / 100), // already in grosze
    record.bankFrom,
    record.bankTo,
    '0',                               // sequence number
    record.accountFrom.replace(/\s/g, ''),
    String(Math.round(record.amount)), // amount in grosze
    record.accountTo.replace(/\s/g, ''),
    '',                                // beneficiary bank name (optional)
    record.workerName.substring(0, 35),
    record.title.substring(0, 35),
    '',
    '',
    '51',                              // transaction code
  ]
  return fields.join('|')
}

export function generateElixirFile(
  payrollRecords: PayrollRecord[],
  companyAccountNRB: string,
  paymentDate?: Date
): string {
  const date = paymentDate ?? new Date()
  const dateStr = formatDate(date)
  const bankFrom = extractBankCode(companyAccountNRB)

  const lines: string[] = []

  for (const record of payrollRecords) {
    if (!record.finalNettoPayout || record.finalNettoPayout <= 0) continue
    if (!(record as any).workerIban) continue

    const workerIban = ((record as any).workerIban as string).replace(/\s/g, '')
    const bankTo = extractBankCode(workerIban)
    const amountGrosze = Math.round(record.finalNettoPayout * 100)

    const elixirRecord: ElixirRecord = {
      orderType: '110',
      date: dateStr,
      amount: amountGrosze,
      bankFrom,
      bankTo,
      accountFrom: companyAccountNRB.replace(/\s/g, ''),
      accountTo: workerIban,
      workerName: record.workerName,
      title: `Wynagrodzenie ${record.monthYear} - ${record.workerName}`,
    }

    lines.push(buildElixirLine(elixirRecord))
  }

  return lines.join('\r\n')
}

export function generateElixirSummary(payrollRecords: PayrollRecord[]): {
  totalWorkers: number
  totalAmount: number
  totalAmountFormatted: string
  currency: string
} {
  const eligible = payrollRecords.filter(
    r => r.finalNettoPayout > 0 && (r as any).workerIban
  )

  const totalAmount = eligible.reduce((sum, r) => sum + r.finalNettoPayout, 0)

  return {
    totalWorkers: eligible.length,
    totalAmount,
    totalAmountFormatted: `${totalAmount.toFixed(2)} PLN`,
    currency: 'PLN',
  }
}
