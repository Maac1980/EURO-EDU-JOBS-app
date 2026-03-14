import React from "react";
import { cn } from "./ui/StatusBadge";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  variant?: "default" | "critical" | "warning" | "success";
}

export function StatCard({ title, value, icon: Icon, variant = "default" }: StatCardProps) {
  let colors = "text-primary bg-primary/10 border-primary/20 shadow-[0_0_15px_rgba(0,240,255,0.1)]";
  let iconColor = "text-primary";
  let valueColor = "text-white";

  if (variant === "critical") {
    colors = "text-destructive bg-destructive/10 border-destructive/30 shadow-[0_0_15px_rgba(255,0,60,0.15)]";
    iconColor = "text-destructive";
    valueColor = "text-destructive";
  } else if (variant === "warning") {
    colors = "text-warning bg-warning/10 border-warning/30 shadow-[0_0_15px_rgba(255,95,0,0.15)]";
    iconColor = "text-warning";
    valueColor = "text-warning";
  } else if (variant === "success") {
    colors = "text-success bg-success/10 border-success/30";
    iconColor = "text-success";
    valueColor = "text-success";
  }

  return (
    <div className={cn("glass-panel rounded-2xl p-6 relative overflow-hidden group", colors)}>
      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-current opacity-10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
      
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-2">
            {title}
          </p>
          <h3 className={cn("text-4xl font-mono font-bold tracking-tight", valueColor)}>
            {value}
          </h3>
        </div>
        <div className={cn("p-3 rounded-xl bg-background/50 backdrop-blur-md border border-white/5", iconColor)}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
