export type Role = "executive" | "legal" | "operations" | "candidate";
export type Tier = 1 | 2 | 3 | 4;

export interface User {
  role: Role;
  tier: Tier;
  designation: string;
  shortName: string;
  name: string;
  email: string;
  candidateId?: string;
}

export type ActiveTab = "calculator" | "home"
  | "candidates"
  | "alerts"
  | "upload"
  | "mydocs"
  | "profile"
  | "more"
  | "jobs"
  | "ats"
  | "interviews"
  | "contracts"
  | "invoices"
  | "regulatory"
  | "immigration"
  | "permits"
  | "gps"
  | "applications"
  | "trc"
  | "availability"
  | "shifts"
  | "paytransparency"
  | "skills"
  | "benchmark"
  | "payroll"
  | "clients"
  | "crm"
  | "pricing"
  | "aiaudit"
  | "gdpr"
  | "agency"
  | "netperhour"
  | "mystatus"
  | "myupo"
  | "myschengen";

export interface Permission {
  seeFinancials: boolean;
  seePayroll: boolean;
  seeGlobalCandidates: boolean;
  seeBizContracts: boolean;
  addCandidates: boolean;
  approveDocs: boolean;
  seeOwnDocsOnly: boolean;
}

export const ROLE_PERMISSIONS: Record<Role, Permission> = {
  executive: {
    seeFinancials:       true,
    seePayroll:          true,
    seeGlobalCandidates: true,
    seeBizContracts:     true,
    addCandidates:       true,
    approveDocs:         true,
    seeOwnDocsOnly:      false,
  },
  legal: {
    seeFinancials:       false,
    seePayroll:          false,
    seeGlobalCandidates: true,
    seeBizContracts:     true,
    addCandidates:       true,
    approveDocs:         true,
    seeOwnDocsOnly:      false,
  },
  operations: {
    seeFinancials:       false,
    seePayroll:          false,
    seeGlobalCandidates: true,
    seeBizContracts:     true,
    addCandidates:       true,
    approveDocs:         true,
    seeOwnDocsOnly:      false,
  },
  candidate: {
    seeFinancials:       false,
    seePayroll:          false,
    seeGlobalCandidates: false,
    seeBizContracts:     false,
    addCandidates:       false,
    approveDocs:         false,
    seeOwnDocsOnly:      true,
  },
};
