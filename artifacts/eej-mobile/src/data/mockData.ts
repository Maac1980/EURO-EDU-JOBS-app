export type DocStatus = "cleared" | "expiring" | "missing" | "pending";

export interface Candidate {
  id: string;
  name: string;
  role: string;
  location: string;
  status: DocStatus;
  statusLabel: string;
  flag: string;
  visaDaysLeft?: number;
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
  },
  {
    id: "c2",
    name: "Daria Shevchenko",
    role: "Healthcare Assistant",
    location: "Kraków, PL",
    status: "expiring",
    statusLabel: "Visa Expiring",
    flag: "🇺🇦",
    visaDaysLeft: 14,
  },
  {
    id: "c3",
    name: "Ahmed Al-Rashid",
    role: "Warehouse Operative",
    location: "Łódź, PL",
    status: "missing",
    statusLabel: "Missing Docs",
    flag: "🇸🇾",
  },
  {
    id: "c4",
    name: "Natalia Petrenko",
    role: "Caregiver",
    location: "Gdańsk, PL",
    status: "cleared",
    statusLabel: "Ready to Deploy",
    flag: "🇺🇦",
  },
  {
    id: "c5",
    name: "Oleksandr Bondar",
    role: "Machine Operator",
    location: "Wrocław, PL",
    status: "pending",
    statusLabel: "Permit Pending",
    flag: "🇺🇦",
    visaDaysLeft: 30,
  },
];

export const OWNER_STATS = {
  totalCandidates: 47,
  placementPct: 68,
  pendingReviews: 12,
  activeDeployments: 31,
  monthlyRevenue: "124,500",
};

export const MANAGER_ALERTS = {
  visaExpiring: [
    { name: "Daria Shevchenko",   daysLeft: 14, type: "TRC Residence" },
    { name: "Oleksandr Bondar",   daysLeft: 30, type: "Work Visa" },
    { name: "Ivan Melnyk",        daysLeft: 7,  type: "Schengen Visa" },
  ],
  missingPassports: [
    { name: "Ahmed Al-Rashid",    missing: "Passport copy" },
    { name: "Tomasz Wiśniewski",  missing: "ID card scan" },
  ],
  workPermits: [
    { name: "Mariusz Kowalski",  status: "approved" as const },
    { name: "Natalia Petrenko",  status: "approved" as const },
    { name: "Yusuf Karahan",     status: "pending" as const },
    { name: "Bogdan Tkachenko",  status: "pending" as const },
  ],
};
