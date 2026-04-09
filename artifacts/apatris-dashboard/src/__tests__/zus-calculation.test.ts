/**
 * ZUS CALCULATION REGRESSION TESTS
 *
 * These tests lock the canonical calculation logic.
 * If ANY test fails, the calculation was changed — DO NOT modify the test,
 * fix the calculation to match these known-good values.
 *
 * Canonical source: KnowledgeCenter.tsx calculate() function
 * All other calculation paths MUST produce identical results.
 */
import { describe, it, expect } from "vitest";
import { calculate, reverseCalculate } from "../components/KnowledgeCenter";

describe("ZUS Canonical Calculation — Umowa Zlecenie, PIT-2 ON, Sickness OFF", () => {

  // ═══ FORWARD: Gross → Net ═══

  it("Benchmark: 31.40 × 160h = 5024 gross → 3929.05 net", () => {
    const r = calculate(160, 31.40, "zlecenie", true, false);
    expect(r.gross).toBe(5024.00);
    expect(r.net).toBe(3929.05);
    expect(r.pit).toBe(128);
    expect(r.taxBase).toBe(3567);
    expect(r.employeeZus).toBeCloseTo(565.70, 1);
    expect(r.health).toBeCloseTo(401.25, 1);
  });

  it("Gross 7337.16 → Net 5600.00", () => {
    const r = calculate(1, 7337.16, "zlecenie", true, false);
    expect(r.net).toBe(5600.00);
  });

  it("Gross 9275.15 → Net 7000.00", () => {
    const r = calculate(1, 9275.15, "zlecenie", true, false);
    expect(r.net).toBe(7000.00);
  });

  it("Gross 11766.69 → Net 8800.00", () => {
    const r = calculate(1, 11766.69, "zlecenie", true, false);
    expect(r.net).toBe(8800.00);
  });

  it("Tax base floor: Gross 9690.00 → Net 7300.01", () => {
    const r = calculate(1, 9690.00, "zlecenie", true, false);
    expect(r.net).toBe(7300.01);
    expect(r.taxBase).toBe(6879);
    expect(r.pit).toBe(525);
  });

  // ═══ EMPLOYER ZUS ═══

  it("Employer ZUS for 5024 gross (zlecenie, no wypadkowe) = 945.01", () => {
    const r = calculate(1, 5024, "zlecenie", true, false);
    // Zlecenie: pension 9.76% + disability 6.5% + FP 2.45% + FGŚP 0.1% = 18.81%
    // No wypadkowe for zlecenie
    expect(r.employerZus).toBeCloseTo(945.01, 1);
  });

  // ═══ REVERSE: Net → Gross ═══

  it("Reverse: desired net/h 35 × 160h → finds gross that gives net 5600", () => {
    const r = reverseCalculate(160, 35, "zlecenie", true, false);
    expect(r.net).toBeCloseTo(5600, 0);
  });

  it("Reverse: desired net/h 43.75 × 160h → finds gross that gives net 7000", () => {
    const r = reverseCalculate(160, 43.75, "zlecenie", true, false);
    expect(r.net).toBeCloseTo(7000, 0);
  });

  it("Reverse: desired net/h 55 × 160h → finds gross that gives net 8800", () => {
    const r = reverseCalculate(160, 55, "zlecenie", true, false);
    expect(r.net).toBeCloseTo(8800, 0);
  });

  // ═══ EDGE CASES ═══

  it("Zero gross → zero net", () => {
    const r = calculate(160, 0, "zlecenie", true, false);
    expect(r.net).toBe(0);
    expect(r.gross).toBe(0);
  });

  it("Very low gross (100 PLN) → PIT-2 absorbs all tax, PIT = 0", () => {
    const r = calculate(1, 100, "zlecenie", true, false);
    expect(r.pit).toBe(0); // 300 PIT-2 reduction > any tax on 100 PLN
    expect(r.net).toBeGreaterThan(0);
  });

  it("Without PIT-2 → higher tax", () => {
    const withPit2 = calculate(160, 31.40, "zlecenie", true, false);
    const withoutPit2 = calculate(160, 31.40, "zlecenie", false, false);
    expect(withoutPit2.net).toBeLessThan(withPit2.net);
    expect(withoutPit2.pit).toBeGreaterThan(withPit2.pit);
  });

  it("With sickness → lower net", () => {
    const without = calculate(160, 31.40, "zlecenie", true, false);
    const withSick = calculate(160, 31.40, "zlecenie", true, true);
    expect(withSick.net).toBeLessThan(without.net);
    expect(withSick.employeeZus).toBeGreaterThan(without.employeeZus);
  });

  // ═══ UMOWA O PRACĘ ═══

  it("Umowa o Pracę: different KUP (250 PLN flat vs 20%)", () => {
    const zlecenie = calculate(160, 31.40, "zlecenie", true, false);
    const prace = calculate(160, 31.40, "praca", true, false);
    // Different tax base calculation → different net
    expect(prace.taxBase).not.toBe(zlecenie.taxBase);
    // Prace includes wypadkowe in employer ZUS
    expect(prace.employerZus).toBeGreaterThan(zlecenie.employerZus);
  });

  // ═══ CONSISTENCY: Both functions must match ═══

  it("calculate() and inline BruttoNettoCalc logic produce same net for 5024", () => {
    const r = calculate(1, 5024, "zlecenie", true, false);
    // Inline logic from BruttoNettoCalc:
    const g = 5024;
    const pension = g * 0.0976;
    const disability = g * 0.0150;
    const totalZUS = pension + disability;
    const healthBase = g - totalZUS;
    const healthTax = healthBase * 0.09;
    const kup = healthBase * 0.20;
    const taxBase = Math.round(healthBase - kup);
    const grossTax = taxBase * 0.12;
    const incomeTax = Math.max(0, Math.round(grossTax - 300));
    const netto = g - totalZUS - healthTax - incomeTax;
    // Allow 0.05 PLN tolerance for rounding differences
    expect(Math.abs(r.net - netto)).toBeLessThan(0.05);
  });
});
