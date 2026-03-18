import { scrypt, randomBytes, timingSafeEqual } from "crypto";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;

function parseBaseId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(app[a-zA-Z0-9]{10,})/);
  return m ? m[1] : undefined;
}

const BASE_ID = parseBaseId(process.env.AIRTABLE_BASE_ID);
const USERS_TABLE = "System_Users";
const BASE_URL = "https://api.airtable.com/v0";

function authHeaders() {
  if (!AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY not set");
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "T1" | "T2" | "T3" | "T4";
  designation: string;
  shortName: string;
}

// ── Password hashing (Node built-in crypto, no extra deps) ─────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, storedHash] = parts;
  return new Promise((resolve) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) { resolve(false); return; }
      try {
        resolve(timingSafeEqual(Buffer.from(storedHash, "hex"), key));
      } catch {
        resolve(false);
      }
    });
  });
}

// ── Airtable helpers ────────────────────────────────────────────────────────

async function listTables(): Promise<string[]> {
  if (!BASE_ID || !AIRTABLE_API_KEY) return [];
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { tables: { name: string }[] };
  return data.tables.map((t) => t.name);
}

async function createSystemUsersTable(): Promise<boolean> {
  if (!BASE_ID || !AIRTABLE_API_KEY) return false;
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name: USERS_TABLE,
      fields: [
        { name: "Name",          type: "singleLineText" },
        { name: "Email",         type: "email" },
        { name: "Password_Hash", type: "singleLineText" },
        { name: "Role",          type: "singleLineText" },
        { name: "Designation",   type: "singleLineText" },
        { name: "Short_Name",    type: "singleLineText" },
      ],
    }),
  });
  return res.ok;
}

function buildUserFromFields(id: string, fields: Record<string, unknown>): SystemUser {
  return {
    id,
    name:         String(fields["Name"]          ?? ""),
    email:        String(fields["Email"]         ?? "").toLowerCase().trim(),
    passwordHash: String(fields["Password_Hash"] ?? ""),
    role:         (String(fields["Role"] ?? "T3")) as SystemUser["role"],
    designation:  String(fields["Designation"]   ?? ""),
    shortName:    String(fields["Short_Name"]    ?? ""),
  };
}

export async function findUserByEmail(email: string): Promise<SystemUser | null> {
  if (!BASE_ID || !AIRTABLE_API_KEY) return null;
  const emailLower = email.toLowerCase().trim();
  const url = new URL(`${BASE_URL}/${BASE_ID}/${encodeURIComponent(USERS_TABLE)}`);
  url.searchParams.set("filterByFormula", `LOWER({Email})="${emailLower}"`);
  url.searchParams.set("pageSize", "1");

  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    console.error("[airtable-users] findByEmail error:", text.slice(0, 200));
    return null;
  }
  const data = (await res.json()) as { records: { id: string; fields: Record<string, unknown> }[] };
  if (!data.records.length) return null;
  const r = data.records[0];
  return buildUserFromFields(r.id, r.fields);
}

export async function listAllUsers(): Promise<SystemUser[]> {
  if (!BASE_ID || !AIRTABLE_API_KEY) return [];
  const url = `${BASE_URL}/${BASE_ID}/${encodeURIComponent(USERS_TABLE)}?pageSize=100`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) return [];
  const data = (await res.json()) as { records: { id: string; fields: Record<string, unknown> }[] };
  return data.records.map((r) => buildUserFromFields(r.id, r.fields));
}

export async function createSystemUser(
  name: string,
  email: string,
  password: string,
  role: "T1" | "T2" | "T3" | "T4",
  designation: string,
  shortName: string
): Promise<SystemUser> {
  if (!BASE_ID || !AIRTABLE_API_KEY) throw new Error("Airtable not configured");
  const passwordHash = await hashPassword(password);
  const url = `${BASE_URL}/${BASE_ID}/${encodeURIComponent(USERS_TABLE)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      fields: {
        Name: name,
        Email: email.toLowerCase().trim(),
        Password_Hash: passwordHash,
        Role: role,
        Designation: designation,
        Short_Name: shortName,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create user: ${text.slice(0, 200)}`);
  }
  const r = (await res.json()) as { id: string; fields: Record<string, unknown> };
  return buildUserFromFields(r.id, r.fields);
}

export async function deleteSystemUser(recordId: string): Promise<void> {
  if (!BASE_ID || !AIRTABLE_API_KEY) throw new Error("Airtable not configured");
  const url = `${BASE_URL}/${BASE_ID}/${encodeURIComponent(USERS_TABLE)}/${recordId}`;
  const res = await fetch(url, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

// ── Startup: ensure table exists and seed initial users ────────────────────

const INITIAL_USERS = [
  { name: "Anna Brzozowska",  email: "ceo@euro-edu-jobs.eu",  role: "T1" as const, designation: "Executive Board & Finance",           shortName: "Executive" },
  { name: "Marta Wiśniewska", email: "legal@euro-edu-jobs.eu", role: "T2" as const, designation: "Head of Legal & Client Relations",     shortName: "Legal & Compliance" },
  { name: "Piotr Nowak",      email: "ops@euro-edu-jobs.eu",   role: "T3" as const, designation: "Workforce & Commercial Operations",    shortName: "Operations" },
];

const INITIAL_PASSWORD = "EEJ2026!";

export async function ensureSystemUsersTable(): Promise<void> {
  try {
    const tables = await listTables();
    if (!tables.includes(USERS_TABLE)) {
      console.log("[auth] System_Users table not found — creating…");
      const ok = await createSystemUsersTable();
      if (!ok) {
        console.warn("[auth] Failed to create System_Users table in Airtable");
        return;
      }
      console.log("[auth] System_Users table created");

      // Seed initial staff accounts
      for (const u of INITIAL_USERS) {
        try {
          await createSystemUser(u.name, u.email, INITIAL_PASSWORD, u.role, u.designation, u.shortName);
          console.log(`[auth] Seeded user: ${u.email} (${u.role})`);
        } catch (e) {
          console.warn(`[auth] Failed to seed ${u.email}:`, (e as Error).message);
        }
      }
    } else {
      // Table exists — check if it has any users; seed if empty
      const existing = await listAllUsers();
      if (existing.length === 0) {
        console.log("[auth] System_Users is empty — seeding initial users…");
        for (const u of INITIAL_USERS) {
          try {
            await createSystemUser(u.name, u.email, INITIAL_PASSWORD, u.role, u.designation, u.shortName);
            console.log(`[auth] Seeded user: ${u.email}`);
          } catch (e) {
            console.warn(`[auth] Seed failed:`, (e as Error).message);
          }
        }
      } else {
        console.log(`[auth] System_Users ready — ${existing.length} user(s) found`);
      }
    }
  } catch (e) {
    console.warn("[auth] ensureSystemUsersTable error:", (e as Error).message);
  }
}
