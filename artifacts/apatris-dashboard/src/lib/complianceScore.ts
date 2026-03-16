import { parseISO, differenceInDays } from "date-fns";

function deduct(dateStr: string | null | undefined, weights: [number, number, number]): number {
  if (!dateStr) return 0;
  const days = differenceInDays(parseISO(dateStr), new Date());
  if (days < 0) return weights[0];
  if (days < 30) return weights[1];
  if (days < 60) return weights[2];
  return 0;
}

export function calcComplianceScore(worker: any): number {
  let score = 100;
  score -= deduct(worker.trcExpiry, [25, 15, 8]);
  score -= deduct(worker.workPermitExpiry, [25, 15, 8]);
  score -= deduct(worker.contractEndDate, [20, 10, 5]);
  score -= deduct(worker.bhpExpiry ?? worker.bhpCertExpiry, [15, 8, 4]);
  if (worker.bhpStatus && worker.bhpStatus !== "Active") score -= 5;
  if (worker.complianceStatus === "non-compliant") score -= 10;
  return Math.max(0, Math.round(score));
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

export function scoreBg(score: number): string {
  if (score >= 80) return "rgba(74,222,128,0.1)";
  if (score >= 50) return "rgba(245,158,11,0.1)";
  return "rgba(239,68,68,0.1)";
}
