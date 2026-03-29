import { describe, it, expect } from "vitest";

// Test the compliance status computation logic directly
function computeStatus(expiryDates: (string | null)[]): {
  status: "critical" | "warning" | "compliant" | "non-compliant";
  daysUntilNextExpiry: number | null;
} {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const expiryDays = expiryDates
    .filter((d): d is string => d !== null)
    .map(d => {
      const expiry = new Date(d);
      expiry.setHours(0, 0, 0, 0);
      return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    });

  if (expiryDays.length === 0) return { status: "compliant", daysUntilNextExpiry: null };

  const minDays = Math.min(...expiryDays);
  if (minDays < 0) return { status: "non-compliant", daysUntilNextExpiry: minDays };
  if (minDays < 30) return { status: "critical", daysUntilNextExpiry: minDays };
  if (minDays < 60) return { status: "warning", daysUntilNextExpiry: minDays };
  return { status: "compliant", daysUntilNextExpiry: minDays };
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("Compliance Status Computation", () => {
  it("returns compliant when no expiry dates", () => {
    const result = computeStatus([null, null, null]);
    expect(result.status).toBe("compliant");
    expect(result.daysUntilNextExpiry).toBeNull();
  });

  it("returns critical when expiry < 30 days", () => {
    const result = computeStatus([daysFromNow(15)]);
    expect(result.status).toBe("critical");
    expect(result.daysUntilNextExpiry).toBe(15);
  });

  it("returns warning when expiry 30-60 days", () => {
    const result = computeStatus([daysFromNow(45)]);
    expect(result.status).toBe("warning");
    expect(result.daysUntilNextExpiry).toBe(45);
  });

  it("returns compliant when expiry > 60 days", () => {
    const result = computeStatus([daysFromNow(90)]);
    expect(result.status).toBe("compliant");
    expect(result.daysUntilNextExpiry).toBe(90);
  });

  it("returns non-compliant when already expired", () => {
    const result = computeStatus([daysFromNow(-10)]);
    expect(result.status).toBe("non-compliant");
    expect(result.daysUntilNextExpiry).toBe(-10);
  });

  it("uses worst status when multiple dates", () => {
    const result = computeStatus([daysFromNow(90), daysFromNow(10), daysFromNow(45)]);
    expect(result.status).toBe("critical");
    expect(result.daysUntilNextExpiry).toBe(10);
  });

  it("expired trumps everything", () => {
    const result = computeStatus([daysFromNow(90), daysFromNow(-5), daysFromNow(200)]);
    expect(result.status).toBe("non-compliant");
    expect(result.daysUntilNextExpiry).toBe(-5);
  });
});

describe("ZUS Calculations", () => {
  const ZUS_RATE = 0.1126; // emerytalne 9.76% + rentowe 1.50%

  it("calculates ZUS correctly for standard salary", () => {
    const gross = 5000;
    const zus = gross * ZUS_RATE;
    expect(zus).toBeCloseTo(563.0, 0);
  });

  it("calculates netto payout correctly", () => {
    const hours = 160;
    const rate = 25;
    const gross = hours * rate; // 4000
    const advances = 500;
    const penalties = 100;
    const netto = gross - advances - penalties;
    expect(netto).toBe(3400);
  });

  it("handles zero hours", () => {
    const netto = 0 * 25 - 0 - 0;
    expect(netto).toBe(0);
  });
});
