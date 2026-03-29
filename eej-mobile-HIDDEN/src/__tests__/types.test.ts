import { describe, it, expect } from "vitest";
import type { ActiveTab, Role, Permission } from "@/types/index";
import { ROLE_PERMISSIONS } from "@/types/index";

describe("ActiveTab type completeness", () => {
  // All tabs that the Dashboard TabContent function handles
  const ALL_EXPECTED_TABS: ActiveTab[] = [
    "calculator", "home", "candidates", "alerts", "upload",
    "mydocs", "profile", "more", "jobs", "ats", "interviews",
    "contracts", "invoices", "regulatory", "immigration", "permits", "gps",
  ];

  it("all expected tabs are valid ActiveTab values", () => {
    // This test verifies at compile-time (via TypeScript) and runtime
    // that every expected tab string is a valid ActiveTab
    expect(ALL_EXPECTED_TABS.length).toBe(17);
    ALL_EXPECTED_TABS.forEach((tab) => {
      expect(typeof tab).toBe("string");
      expect(tab.length).toBeGreaterThan(0);
    });
  });

  it("no duplicate tabs exist", () => {
    const unique = new Set(ALL_EXPECTED_TABS);
    expect(unique.size).toBe(ALL_EXPECTED_TABS.length);
  });
});

describe("Role permissions", () => {
  const ALL_ROLES: Role[] = ["executive", "legal", "operations", "candidate"];

  it("all roles have permissions defined", () => {
    ALL_ROLES.forEach((role) => {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    });
  });

  it("executive has full access", () => {
    const exec = ROLE_PERMISSIONS.executive;
    expect(exec.seeFinancials).toBe(true);
    expect(exec.seePayroll).toBe(true);
    expect(exec.seeGlobalCandidates).toBe(true);
    expect(exec.seeBizContracts).toBe(true);
    expect(exec.addCandidates).toBe(true);
    expect(exec.approveDocs).toBe(true);
    expect(exec.seeOwnDocsOnly).toBe(false);
  });

  it("candidate has restricted access", () => {
    const cand = ROLE_PERMISSIONS.candidate;
    expect(cand.seeFinancials).toBe(false);
    expect(cand.seePayroll).toBe(false);
    expect(cand.seeGlobalCandidates).toBe(false);
    expect(cand.seeBizContracts).toBe(false);
    expect(cand.addCandidates).toBe(false);
    expect(cand.approveDocs).toBe(false);
    expect(cand.seeOwnDocsOnly).toBe(true);
  });

  it("legal cannot see financials or payroll", () => {
    const legal = ROLE_PERMISSIONS.legal;
    expect(legal.seeFinancials).toBe(false);
    expect(legal.seePayroll).toBe(false);
    expect(legal.seeGlobalCandidates).toBe(true);
    expect(legal.approveDocs).toBe(true);
  });

  it("operations cannot see financials or payroll", () => {
    const ops = ROLE_PERMISSIONS.operations;
    expect(ops.seeFinancials).toBe(false);
    expect(ops.seePayroll).toBe(false);
    expect(ops.seeGlobalCandidates).toBe(true);
    expect(ops.addCandidates).toBe(true);
  });

  it("all permission objects have exactly 7 boolean fields", () => {
    const expectedKeys: (keyof Permission)[] = [
      "seeFinancials", "seePayroll", "seeGlobalCandidates",
      "seeBizContracts", "addCandidates", "approveDocs", "seeOwnDocsOnly",
    ];
    ALL_ROLES.forEach((role) => {
      const perms = ROLE_PERMISSIONS[role];
      expectedKeys.forEach((key) => {
        expect(typeof perms[key]).toBe("boolean");
      });
      expect(Object.keys(perms).length).toBe(7);
    });
  });

  it("candidate is the only role with seeOwnDocsOnly=true", () => {
    ALL_ROLES.forEach((role) => {
      if (role === "candidate") {
        expect(ROLE_PERMISSIONS[role].seeOwnDocsOnly).toBe(true);
      } else {
        expect(ROLE_PERMISSIONS[role].seeOwnDocsOnly).toBe(false);
      }
    });
  });
});
