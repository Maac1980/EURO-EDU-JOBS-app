/**
 * Multi-country payroll net-pay calculator.
 *
 * Supports PL (Poland), CZ (Czech Republic), RO (Romania) for 2026 rates.
 * Throws for unsupported country codes.
 */
import { calculatePayroll } from "./payroll.js";

export interface CountryNetPay {
  country: string;
  currency: string;
  grossMonthly: number;
  netMonthly: number;
  totalEmployerCost: number;
  meetsMinimumWage: boolean;
  socialSecurity: { employee: number; employer: number };
  health: { employee: number; employer?: number };
  incomeTax: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

function calcPL(grossMonthly: number): CountryNetPay {
  const r = calculatePayroll(grossMonthly, false);
  return {
    country: "PL",
    currency: "PLN",
    grossMonthly: r.gross,
    netMonthly: r.net,
    totalEmployerCost: r.totalEmployerCost,
    meetsMinimumWage: grossMonthly >= 4666,
    socialSecurity: {
      employee: round(r.details.social),
      employer: round(r.employerZus),
    },
    health: { employee: round(r.details.health) },
    incomeTax: round(r.details.pit),
  };
}

function calcCZ(grossMonthly: number): CountryNetPay {
  // CZ 2026 rates
  const employeeSS = round(grossMonthly * 0.071); // 6.5% pension + 0.6% sickness
  const employerSS = round(grossMonthly * 0.248);
  const employeeHealth = round(grossMonthly * 0.045);
  const employerHealth = round(grossMonthly * 0.09);
  const personalAllowance = 2570; // CZK / month
  const taxBase = grossMonthly;
  const grossTax = round(taxBase * 0.15);
  const incomeTax = Math.max(0, round(grossTax - personalAllowance));
  const netMonthly = round(grossMonthly - employeeSS - employeeHealth - incomeTax);
  const totalEmployerCost = round(grossMonthly + employerSS + employerHealth);
  return {
    country: "CZ",
    currency: "CZK",
    grossMonthly: round(grossMonthly),
    netMonthly,
    totalEmployerCost,
    meetsMinimumWage: grossMonthly >= 18900,
    socialSecurity: { employee: employeeSS, employer: employerSS },
    health: { employee: employeeHealth, employer: employerHealth },
    incomeTax,
  };
}

function calcRO(grossMonthly: number): CountryNetPay {
  // RO 2026 rates
  const cas = round(grossMonthly * 0.25); // pension (employee)
  const cass = round(grossMonthly * 0.10); // health (employee)
  const taxBase = Math.max(0, grossMonthly - cas - cass);
  const incomeTax = round(taxBase * 0.10);
  const cam = round(grossMonthly * 0.0225); // employer labour insurance
  const netMonthly = round(grossMonthly - cas - cass - incomeTax);
  const totalEmployerCost = round(grossMonthly + cam);
  return {
    country: "RO",
    currency: "RON",
    grossMonthly: round(grossMonthly),
    netMonthly,
    totalEmployerCost,
    meetsMinimumWage: grossMonthly >= 3700,
    socialSecurity: { employee: cas, employer: 0 },
    health: { employee: cass, employer: 0 },
    incomeTax,
  };
}

export function calculateNetPay(countryCode: string, grossMonthly: number): CountryNetPay {
  const code = countryCode.toUpperCase();
  switch (code) {
    case "PL":
      return calcPL(grossMonthly);
    case "CZ":
      return calcCZ(grossMonthly);
    case "RO":
      return calcRO(grossMonthly);
    default:
      throw new Error(`Unsupported country: ${countryCode}`);
  }
}
