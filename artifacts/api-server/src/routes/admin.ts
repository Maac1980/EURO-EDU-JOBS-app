import { Router } from "express";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const PROFILE_FILE = join(DATA_DIR, "admin-profile.json");

interface AdminProfile {
  fullName: string;
  email: string;
  phone: string;
  role: string;
}

function readProfile(): AdminProfile {
  if (!existsSync(PROFILE_FILE)) {
    mkdirSync(DATA_DIR, { recursive: true });
    const defaults: AdminProfile = {
      fullName: "Anna",
      email: "anna.b@edu-jobs.eu",
      phone: "",
      role: "Administrator",
    };
    writeFileSync(PROFILE_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(readFileSync(PROFILE_FILE, "utf-8")) as AdminProfile;
}

function writeProfile(profile: AdminProfile): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
}

router.get("/admin/profile", (_req, res) => {
  try {
    const profile = readProfile();
    return res.json(profile);
  } catch (err) {
    console.error("Failed to read admin profile:", err);
    return res.status(500).json({ error: "Could not load admin profile." });
  }
});

router.patch("/admin/profile", (req, res) => {
  try {
    const current = readProfile();
    const { email, phone } = req.body as { email?: string; phone?: string };
    if (email !== undefined) current.email = email.trim();
    if (phone !== undefined) current.phone = phone.trim();
    writeProfile(current);
    return res.json(current);
  } catch (err) {
    console.error("Failed to update admin profile:", err);
    return res.status(500).json({ error: "Could not save admin profile." });
  }
});

export default router;
