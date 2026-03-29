import { describe, it, expect } from "vitest";
import { calculate } from "@/components/KnowledgeCenter";

describe("calculate — ZUS Calculator", () => {
  describe("Umowa Zlecenie", () => {
    it("calculates gross correctly from hours and rate", () => {
      const result = calculate(160, 31.40, "zlecenie", true, false);
      expect(result.gross).toBeCloseTo(5024, 0);
    });

    it("returns net less than gross", () => {
      const result = calculate(160, 31.40, "zlecenie", true, false);
      expect(result.net).toBeLessThan(result.gross);
      expect(result.net).toBeGreaterThan(0);
    });

    it("returns positive employee ZUS", () => {
      const result = calculate(160, 31.40, "zlecenie", true, false);
      expect(result.employeeZus).toBeGreaterThan(0);
    });

    it("returns positive employer ZUS", () => {
      const result = calculate(160, 31.40, "zlecenie", true, false);
      expect(result.employerZus).toBeGreaterThan(0);
    });

    it("total cost exceeds gross", () => {
      const result = calculate(160, 31.40, "zlecenie", true, false);
      expect(result.totalCost).toBeGreaterThan(result.gross);
    });

    it("uses 20% KUP for zlecenie tax base", () => {
      const result = calculate(100, 50, "zlecenie", false, false);
      // gross = 5000
      // employeeZus = pension + disability = 5000*0.0976 + 5000*0.015 = 488 + 75 = 563
      // KUP = (5000 - 563) * 0.20 = 887.40
      // taxBase = round(5000 - 563 - 887.40) = 3550
      expect(result.taxBase).toBeCloseTo(3550, 0);
    });
  });

  describe("Umowa o Prace", () => {
    it("calculates gross correctly", () => {
      const result = calculate(160, 30, "praca", true, false);
      expect(result.gross).toBeCloseTo(4800, 0);
    });

    it("uses 250 PLN KUP for prace tax base", () => {
      const result = calculate(160, 30, "praca", false, false);
      const gross = 4800;
      const pension = Math.round(gross * 0.0976 * 100) / 100;
      const disability = Math.round(gross * 0.015 * 100) / 100;
      const employeeZus = pension + disability;
      const expectedTaxBase = Math.round(gross - employeeZus - 250);
      expect(result.taxBase).toBeCloseTo(expectedTaxBase, 0);
    });

    it("includes accident insurance in employer ZUS for prace", () => {
      const resultPrace = calculate(160, 30, "praca", true, false);
      const resultZlecenie = calculate(160, 30, "zlecenie", true, false);
      // Prace should have higher employer ZUS due to accident insurance
      expect(resultPrace.employerZus).toBeGreaterThan(resultZlecenie.employerZus);
    });
  });

  describe("PIT-2 deduction", () => {
    it("reduces PIT by 300 PLN when PIT-2 is applied", () => {
      const withPit2 = calculate(160, 31.40, "zlecenie", true, false);
      const withoutPit2 = calculate(160, 31.40, "zlecenie", false, false);
      // PIT should be lower with PIT-2 (by up to 300)
      expect(withPit2.pit).toBeLessThanOrEqual(withoutPit2.pit);
      // If withoutPit2.pit >= 300, the difference should be exactly 300
      if (withoutPit2.pit >= 300) {
        expect(withoutPit2.pit - withPit2.pit).toBe(300);
      }
    });

    it("PIT never goes below 0 even with PIT-2", () => {
      // Very low earnings
      const result = calculate(10, 5, "zlecenie", true, false);
      expect(result.pit).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Sickness insurance toggle", () => {
    it("sickness insurance increases employee ZUS", () => {
      const withSickness = calculate(160, 31.40, "zlecenie", true, true);
      const withoutSickness = calculate(160, 31.40, "zlecenie", true, false);
      expect(withSickness.employeeZus).toBeGreaterThan(withoutSickness.employeeZus);
    });

    it("sickness insurance at 2.45% of gross", () => {
      const withSickness = calculate(160, 31.40, "zlecenie", true, true);
      const withoutSickness = calculate(160, 31.40, "zlecenie", true, false);
      const gross = 160 * 31.40;
      const expectedSickness = Math.round(gross * 0.0245 * 100) / 100;
      expect(withSickness.employeeZus - withoutSickness.employeeZus).toBeCloseTo(expectedSickness, 2);
    });

    it("sickness insurance reduces net pay", () => {
      const withSickness = calculate(160, 31.40, "zlecenie", true, true);
      const withoutSickness = calculate(160, 31.40, "zlecenie", true, false);
      expect(withSickness.net).toBeLessThan(withoutSickness.net);
    });
  });

  describe("Edge cases", () => {
    it("handles zero hours", () => {
      const result = calculate(0, 31.40, "zlecenie", true, false);
      expect(result.gross).toBe(0);
      expect(result.net).toBe(0);
    });

    it("handles zero rate", () => {
      const result = calculate(160, 0, "zlecenie", true, false);
      expect(result.gross).toBe(0);
      expect(result.net).toBe(0);
    });
  });
});
