import { Router } from "express";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { authenticateToken, requireAdmin, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";

const router = Router();

router.get("/clients", authenticateToken, async (_req, res) => {
  const clients = await db.select().from(schema.clients).orderBy(schema.clients.name);
  return res.json({ clients });
});

router.post("/clients", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  const { name, contactPerson, email, phone, address, nip, billingRate, notes } = req.body as any;
  if (!name) return res.status(400).json({ error: "Client name is required." });
  const [newClient] = await db.insert(schema.clients).values({
    name: name.trim(),
    contactPerson: (contactPerson ?? "").trim(),
    email: (email ?? "").trim(),
    phone: (phone ?? "").trim(),
    address: (address ?? "").trim(),
    nip: (nip ?? "").trim(),
    billingRate: typeof billingRate === "number" ? billingRate : null,
    notes: (notes ?? "").trim(),
  }).returning();
  return res.status(201).json(newClient);
});

router.patch("/clients/:id", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  const [existing] = await db.select().from(schema.clients).where(eq(schema.clients.id, String(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Client not found." });
  const updates = { ...req.body, id: undefined, updatedAt: new Date() };
  delete updates.id;
  await db.update(schema.clients).set(updates).where(eq(schema.clients.id, String(req.params.id)));
  const [updated] = await db.select().from(schema.clients).where(eq(schema.clients.id, String(req.params.id)));
  return res.json(updated);
});

router.delete("/clients/:id", authenticateToken, requireAdmin, async (req, res) => {
  const [existing] = await db.select().from(schema.clients).where(eq(schema.clients.id, String(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Client not found." });
  await db.delete(schema.clients).where(eq(schema.clients.id, String(req.params.id)));
  return res.json({ success: true });
});

export default router;
