import type { LucideIcon } from "lucide-react";
import { BookMarked, Clock, ClipboardList, Building2, HeartPulse, Users } from "lucide-react";

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
  iconColor: string;
  iconBg: string;
}

const ALL_MODULES: Record<ModuleId, ModuleDef> = {
  "zus-ledger":         { id: "zus-ledger",         label: "ZUS & Ledger",       sublabel: "Payroll · Social Insurance", Icon: BookMarked,   iconColor: "#1B2A4A", iconBg: "#E8EDF5" },
  "timesheets":         { id: "timesheets",         label: "Timesheets & Hours", sublabel: "Attendance · Overtime",      Icon: Clock,        iconColor: "#6366F1", iconBg: "#EEF2FF" },
  "pip-compliance":     { id: "pip-compliance",     label: "PIP / Compliance",   sublabel: "Dossiers · PIPs",            Icon: ClipboardList, iconColor: "#D97706", iconBg: "#FFFBEB" },
  "b2b-contracts":      { id: "b2b-contracts",      label: "B2B Contracts",      sublabel: "Client Agreements",          Icon: Building2,    iconColor: "#0EA5E9", iconBg: "#F0F9FF" },
  "bhp-medical":        { id: "bhp-medical",        label: "BHP / Medical",      sublabel: "H&S · Certificates",        Icon: HeartPulse,   iconColor: "#10B981", iconBg: "#ECFDF5" },
  "candidate-pipeline": { id: "candidate-pipeline", label: "Candidate Pipeline", sublabel: "Stages · Placement",         Icon: Users,        iconColor: "#8B5CF6", iconBg: "#F5F3FF" },
};

interface Props {
  modules: ModuleId[];
  onOpen?: (id: ModuleId) => void;
}

export default function PlatformModules({ modules, onOpen }: Props) {
  return (
    <div className="pm-grid">
      {modules.map((id) => {
        const m = ALL_MODULES[id];
        return (
          <button key={id} className="pm-card" onClick={() => onOpen?.(id)}>
            <div className="pm-icon-wrap" style={{ background: m.iconBg }}>
              <m.Icon size={20} strokeWidth={2} color={m.iconColor} />
            </div>
            <div className="pm-title">{m.label}</div>
            <div className="pm-sub">{m.sublabel}</div>
          </button>
        );
      })}
    </div>
  );
}
