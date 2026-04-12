/**
 * LEGAL DECISION ENGINE — 8 UNIT TESTS
 *
 * Covers: Art.108, TRC expiry, EU nationals, no permit,
 * expired+no filing, expiring soon, employer change, late filing.
 *
 * If ANY test fails → fix the engine, not the test.
 */
import { describe, it, expect } from "vitest";
import { evaluateLegalStatus, type LegalInput } from "../services/legal-decision-engine";

function baseInput(overrides: Partial<LegalInput> = {}): LegalInput {
  return {
    workerId: "test-1", workerName: "Test Worker", nationality: "Ukrainian",
    permitExpiry: "2027-01-01", trcExpiry: "2027-01-01",
    trcFilingDate: null, trcApplicationPending: false,
    employerContinuity: true, roleContinuity: true, formalDefect: false,
    contractEndDate: "2027-06-01", bhpExpiry: "2027-06-01", medicalExpiry: "2027-06-01",
    oswiadczenieExpiry: null, hasValidPassport: true, evidenceSubmitted: [],
    ...overrides,
  };
}

const future = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const past = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

describe("Legal Decision Engine", () => {
  it("1. EU national = VALID without permit", () => {
    const r = evaluateLegalStatus(baseInput({ nationality: "Polish", permitExpiry: null, trcExpiry: null }));
    expect(r.legalStatus).toBe("VALID");
    expect(r.art108Eligible).toBe(false);
  });

  it("2. No permit/TRC = NO_PERMIT + CRITICAL", () => {
    const r = evaluateLegalStatus(baseInput({ permitExpiry: null, trcExpiry: null, trcApplicationPending: false }));
    expect(r.legalStatus).toBe("NO_PERMIT");
    expect(r.riskLevel).toBe("CRITICAL");
  });

  it("3. Art.108 filed before expiry = PROTECTED_PENDING", () => {
    const r = evaluateLegalStatus(baseInput({ trcExpiry: past(10), permitExpiry: past(10), trcFilingDate: past(20), trcApplicationPending: true }));
    expect(r.legalStatus).toBe("PROTECTED_PENDING");
    expect(r.art108Applied).toBe(true);
  });

  it("4. Art.108 filed AFTER expiry = EXPIRED_NOT_PROTECTED", () => {
    const r = evaluateLegalStatus(baseInput({ trcExpiry: past(30), permitExpiry: past(30), trcFilingDate: past(10), trcApplicationPending: true }));
    expect(r.legalStatus).toBe("EXPIRED_NOT_PROTECTED");
    expect(r.art108Applied).toBe(false);
  });

  it("5. Valid permit 120d remaining = VALID + LOW", () => {
    const r = evaluateLegalStatus(baseInput({ permitExpiry: future(120), trcExpiry: future(120) }));
    expect(r.legalStatus).toBe("VALID");
    expect(r.riskLevel).toBe("LOW");
  });

  it("6. Permit expiring in 10d = EXPIRING_SOON + HIGH", () => {
    const r = evaluateLegalStatus(baseInput({ permitExpiry: future(10), trcExpiry: future(10) }));
    expect(r.legalStatus).toBe("EXPIRING_SOON");
    expect(r.riskLevel).toBe("HIGH");
  });

  it("7. Expired permit no filing = EXPIRED + CRITICAL", () => {
    const r = evaluateLegalStatus(baseInput({ permitExpiry: past(5), trcExpiry: past(5), trcApplicationPending: false }));
    expect(r.legalStatus).toBe("EXPIRED_NOT_PROTECTED");
    expect(r.riskLevel).toBe("CRITICAL");
  });

  it("8. Art.108 + employer change = warning", () => {
    const r = evaluateLegalStatus(baseInput({ trcExpiry: past(10), permitExpiry: past(10), trcFilingDate: past(20), trcApplicationPending: true, employerContinuity: false }));
    expect(r.art108Applied).toBe(true);
    expect(r.warnings.some(w => w.includes("EMPLOYER"))).toBe(true);
  });
});
