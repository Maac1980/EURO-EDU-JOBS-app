export type Role = "owner" | "manager" | "office" | "worker";

export interface User {
  role: Role;
  name: string;
}

export type StaffTab = "home" | "candidates" | "alerts" | "profile";
export type WorkerTab = "home" | "mydocs" | "timesheet" | "profile";
export type ActiveTab = StaffTab | WorkerTab;
