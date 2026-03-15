import { Router } from "express";
import jwt from "jsonwebtoken";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "eej-jwt-fallback-secret-2024";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_URL = "https://api.airtable.com/v0";

function extractBaseId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(app[a-zA-Z0-9]{10,})/);
  return match ? match[1] : raw.trim();
}

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  if (!AIRTABLE_API_KEY) {
    return res.status(503).json({ error: "Authentication service not configured. Add AIRTABLE_API_KEY to Secrets." });
  }

  const baseId = extractBaseId(process.env.AIRTABLE_BASE_ID);
  if (!baseId) {
    return res.status(503).json({ error: "Authentication service not configured. Add AIRTABLE_BASE_ID to Secrets." });
  }

  try {
    const url = new URL(`${BASE_URL}/${baseId}/USERS`);
    url.searchParams.set("filterByFormula", `{Email}="${email.replace(/"/g, '\\"')}"`);
    url.searchParams.set("maxRecords", "1");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Airtable USERS query failed:", text);
      return res.status(500).json({ error: "Authentication service error." });
    }

    const data = (await response.json()) as {
      records: Array<{ id: string; fields: Record<string, unknown> }>;
    };

    if (!data.records || data.records.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const record = data.records[0];
    const storedPassword = record.fields["Password"] as string | undefined;

    if (!storedPassword || storedPassword !== password) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const role = (record.fields["Role"] as string) ?? "Staff";
    const name = (record.fields["Name"] as string) ?? email.split("@")[0];

    const token = jwt.sign(
      { email, name, role, id: record.id },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.json({ token, user: { email, name, role } });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Authentication failed. Please try again." });
  }
});

router.post("/auth/verify", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ valid: false });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ valid: true, user: decoded });
  } catch {
    return res.status(401).json({ valid: false });
  }
});

export default router;
