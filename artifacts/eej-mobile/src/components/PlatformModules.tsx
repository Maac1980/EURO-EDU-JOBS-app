import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  Clock,
  ClipboardList,
  Building2,
  HeartPulse,
  Users,
  ChevronRight,
} from "lucide-react";

export type ModuleId =
  | "zus-ledger"
  | "timesheets"
  | "pip-compliance"
  | "b2b-contracts"
  | "bhp-medical"
  | "candidate-pipeline";

interface ModuleDef {
  id: ModuleId;
  label: string;
  sublabel: string;
  Icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
}

const ALL_MODULES: Record<ModuleId, ModuleDef> = {
  "zus-ledger": {
    id: "zus-ledger",
    label: "ZUS & Ledger",
    sublabel: "Payroll · Social Insurance",
    Icon: BookMarked,
    color: "#FFD600",
    bg: "#1B2A4A",
    border: "#2D4270",
  },
  "timesheets": {
    id: "timesheets",
    label: "Timesheets & Hours",
    sublabel: "Attendance · Overtime",
    Icon: Clock,
    color: "#6366F1",
    bg: "#EEF2FF",
    border: "#C7D2FE",
  },
  "pip-compliance": {
    id: "pip-compliance",
    label: "PIP / Compliance",
    sublabel: "Dossiers · PIPs",
    Icon: ClipboardList,
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
  },
  "b2b-contracts": {
    id: "b2b-contracts",
    label: "B2B Contracts",
    sublabel: "Client Agreements",
    Icon: Building2,
    color: "#0EA5E9",
    bg: "#F0F9FF",
    border: "#BAE6FD",
  },
  "bhp-medical": {
    id: "bhp-medical",
    label: "BHP / Medical",
    sublabel: "H&S · Certificates",
    Icon: HeartPulse,
    color: "#10B981",
    bg: "#ECFDF5",
    border: "#6EE7B7",
  },
  "candidate-pipeline": {
    id: "candidate-pipeline",
    label: "Candidate Pipeline",
    sublabel: "Stages · Placement",
    Icon: Users,
    color: "#8B5CF6",
    bg: "#F5F3FF",
    border: "#DDD6FE",
  },
};

interface Props {
  modules: ModuleId[];
  onOpen?: (id: ModuleId) => void;
}

export default function PlatformModules({ modules, onOpen }: Props) {
  return (
    <div className="platform-modules-grid">
      {modules.map((id) => {
        const m = ALL_MODULES[id];
        const isDark = m.bg === "#1B2A4A";
        return (
          <button
            key={id}
            className="platform-module-tile"
            style={{
              background: m.bg,
              borderColor: m.border,
            }}
            onClick={() => onOpen?.(id)}
          >
            <div
              className="pm-icon-wrap"
              style={{ background: isDark ? "rgba(255,255,255,0.1)" : m.color + "1A" }}
            >
              <m.Icon
                size={20}
                strokeWidth={2}
                color={isDark ? m.color : m.color}
              />
            </div>
            <div className="pm-label" style={{ color: isDark ? "#ffffff" : "#111827" }}>
              {m.label}
            </div>
            <div className="pm-sublabel" style={{ color: isDark ? "rgba(255,255,255,0.5)" : "#6B7280" }}>
              {m.sublabel}
            </div>
            <ChevronRight
              size={12}
              color={isDark ? "rgba(255,255,255,0.4)" : "#D1D5DB"}
              style={{ position: "absolute", top: 10, right: 10 }}
            />
          </button>
        );
      })}
    </div>
  );
}
