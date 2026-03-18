export type DocStatus = "cleared" | "expiring" | "missing" | "pending";
export type DocReviewStatus = "approved" | "under-review" | "rejected" | "missing";

export interface CandidateDocument {
  id: string;
  name: string;
  status: DocReviewStatus;
  uploadedAt?: string;
  expiresAt?: string;
}

export interface Candidate {
  id: string;
  name: string;
  role: string;
  location: string;
  status: DocStatus;
  statusLabel: string;
  flag: string;
  nationality: string;
  phone: string;
  email: string;
  visaDaysLeft?: number;
  documents: CandidateDocument[];
}

export const MOCK_CANDIDATES: Candidate[] = [
  {
    id: "c1",
    name: "Mariusz Kowalski",
    role: "Construction Supervisor",
    location: "Warsaw, PL",
    status: "cleared",
    statusLabel: "Cleared",
    flag: "🇵🇱",
    nationality: "Polish",
    phone: "+48 600 123 456",
    email: "m.kowalski@eej.eu",
    documents: [
      { id: "d1", name: "Passport",            status: "approved",      uploadedAt: "12 Jan 2026", expiresAt: "11 Jan 2031" },
      { id: "d2", name: "Work Permit (A1)",    status: "approved",      uploadedAt: "05 Feb 2026", expiresAt: "04 Feb 2027" },
      { id: "d3", name: "BHP Certificate",     status: "approved",      uploadedAt: "20 Jan 2026", expiresAt: "19 Jan 2027" },
      { id: "d4", name: "Medical Certificate", status: "under-review",  uploadedAt: "01 Mar 2026"  },
      { id: "d5", name: "TRC Residence Card",  status: "approved",      uploadedAt: "10 Jan 2026", expiresAt: "09 Jan 2028" },
    ],
  },
  {
    id: "c2",
    name: "Daria Shevchenko",
    role: "Healthcare Assistant",
    location: "Kraków, PL",
    status: "expiring",
    statusLabel: "Visa Expiring",
    flag: "🇺🇦",
    nationality: "Ukrainian",
    phone: "+48 700 987 321",
    email: "d.shevchenko@eej.eu",
    visaDaysLeft: 14,
    documents: [
      { id: "d1", name: "Passport",            status: "approved",      uploadedAt: "08 Sep 2025", expiresAt: "07 Sep 2030" },
      { id: "d2", name: "TRC Residence Card",  status: "under-review",  uploadedAt: "02 Mar 2026"  },
      { id: "d3", name: "Work Permit (A1)",    status: "approved",      uploadedAt: "15 Oct 2025", expiresAt: "14 Oct 2026" },
      { id: "d4", name: "Medical Certificate", status: "approved",      uploadedAt: "10 Nov 2025"  },
      { id: "d5", name: "BHP Certificate",     status: "under-review",  uploadedAt: "28 Feb 2026"  },
    ],
  },
  {
    id: "c3",
    name: "Ahmed Al-Rashid",
    role: "Warehouse Operative",
    location: "Łódź, PL",
    status: "missing",
    statusLabel: "Missing Docs",
    flag: "🇸🇾",
    nationality: "Syrian",
    phone: "+48 512 654 789",
    email: "a.alrashid@eej.eu",
    documents: [
      { id: "d1", name: "Passport",            status: "missing"                                    },
      { id: "d2", name: "Work Permit (A1)",    status: "under-review",  uploadedAt: "05 Mar 2026"  },
      { id: "d3", name: "TRC Residence Card",  status: "missing"                                    },
      { id: "d4", name: "BHP Certificate",     status: "under-review",  uploadedAt: "06 Mar 2026"  },
      { id: "d5", name: "Medical Certificate", status: "rejected",      uploadedAt: "01 Mar 2026"  },
    ],
  },
  {
    id: "c4",
    name: "Natalia Petrenko",
    role: "Caregiver",
    location: "Gdańsk, PL",
    status: "cleared",
    statusLabel: "Ready to Deploy",
    flag: "🇺🇦",
    nationality: "Ukrainian",
    phone: "+48 730 222 111",
    email: "n.petrenko@eej.eu",
    documents: [
      { id: "d1", name: "Passport",            status: "approved",      uploadedAt: "14 Dec 2025", expiresAt: "13 Dec 2030" },
      { id: "d2", name: "TRC Residence Card",  status: "approved",      uploadedAt: "20 Dec 2025", expiresAt: "19 Dec 2027" },
      { id: "d3", name: "Work Permit (A1)",    status: "approved",      uploadedAt: "03 Jan 2026", expiresAt: "02 Jan 2027" },
      { id: "d4", name: "BHP Certificate",     status: "approved",      uploadedAt: "10 Jan 2026"  },
      { id: "d5", name: "Medical Certificate", status: "approved",      uploadedAt: "11 Jan 2026"  },
    ],
  },
  {
    id: "c5",
    name: "Oleksandr Bondar",
    role: "Machine Operator",
    location: "Wrocław, PL",
    status: "pending",
    statusLabel: "Permit Pending",
    flag: "🇺🇦",
    nationality: "Ukrainian",
    phone: "+48 600 444 777",
    email: "o.bondar@eej.eu",
    visaDaysLeft: 30,
    documents: [
      { id: "d1", name: "Passport",            status: "approved",      uploadedAt: "22 Nov 2025", expiresAt: "21 Nov 2030" },
      { id: "d2", name: "Work Permit (A1)",    status: "under-review",  uploadedAt: "10 Mar 2026"  },
      { id: "d3", name: "TRC Residence Card",  status: "under-review",  uploadedAt: "10 Mar 2026"  },
      { id: "d4", name: "BHP Certificate",     status: "approved",      uploadedAt: "05 Feb 2026"  },
      { id: "d5", name: "Medical Certificate", status: "approved",      uploadedAt: "06 Feb 2026"  },
    ],
  },
];

export const EXEC_STATS = {
  totalCandidates:  47,
  placementPct:     68,
  pendingReviews:   12,
  activeDeployments: 31,
  monthlyRevenue:   "124,500",
  zusLiability:     "14,020",
  b2bContracts:     8,
};

export const COMPLIANCE_ALERTS = {
  visaExpiring: [
    { name: "Daria Shevchenko",  daysLeft: 14, type: "TRC Residence" },
    { name: "Oleksandr Bondar",  daysLeft: 30, type: "Work Visa" },
    { name: "Ivan Melnyk",       daysLeft: 7,  type: "Schengen Visa" },
  ],
  missingPassports: [
    { name: "Ahmed Al-Rashid",   missing: "Passport copy" },
    { name: "Tomasz Wiśniewski", missing: "ID card scan" },
  ],
  workPermits: [
    { name: "Mariusz Kowalski", status: "approved" as const },
    { name: "Natalia Petrenko", status: "approved" as const },
    { name: "Yusuf Karahan",    status: "pending"  as const },
    { name: "Bogdan Tkachenko", status: "pending"  as const },
  ],
};

export const OPS_PIPELINE = [
  { stage: "New Applications",  count: 11, color: "#3B82F6" },
  { stage: "Docs Submitted",    count: 8,  color: "#F59E0B" },
  { stage: "Under Review",      count: 6,  color: "#8B5CF6" },
  { stage: "Cleared to Deploy", count: 14, color: "#10B981" },
  { stage: "On Assignment",     count: 8,  color: "#1B2A4A" },
];

export const B2B_CONTRACTS = [
  { client: "BuildPro Sp. z o.o.",   role: "Construction Workers", headcount: 12, status: "active"  as const },
  { client: "MediCare PL",            role: "Healthcare Assistants", headcount: 6, status: "active"  as const },
  { client: "LogiTrans Wrocław",      role: "Warehouse Operatives", headcount: 9, status: "pending" as const },
];
