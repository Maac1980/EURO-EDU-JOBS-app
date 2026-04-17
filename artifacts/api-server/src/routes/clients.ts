import { Router } from "express";
import { db, schema } from "../db/index.js";
import { and, eq } from "drizzle-orm";
import { authenticateToken, requireAdmin, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { requireTenant } from "../lib/tenancy.js";

const router = Router();

router.get("/clients", authenticateToken, async (req, res) => {
  const tenantId = requireTenant(req);
  const clients = await db.select().from(schema.clients)
    .where(eq(schema.clients.tenantId, tenantId))
    .orderBy(schema.clients.name);
  return res.json({ clients });
});

router.post("/clients", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  const { name, contactPerson, email, phone, address, nip, billingRate, notes } = req.body as any;
  if (!name) return res.status(400).json({ error: "Client name is required." });
  const tenantId = requireTenant(req);
  const [newClient] = await db.insert(schema.clients).values({
    name: name.trim(),
    contactPerson: (contactPerson ?? "").trim(),
    email: (email ?? "").trim(),
    phone: (phone ?? "").trim(),
    address: (address ?? "").trim(),
    nip: (nip ?? "").trim(),
    billingRate: typeof billingRate === "number" ? billingRate.toString() : null,
    notes: (notes ?? "").trim(),
    tenantId,
  }).returning();
  return res.status(201).json(newClient);
});

router.patch("/clients/:id", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  const tenantId = requireTenant(req);
  const [existing] = await db.select().from(schema.clients).where(
    and(eq(schema.clients.id, String(req.params.id)), eq(schema.clients.tenantId, tenantId))
  );
  if (!existing) return res.status(404).json({ error: "Client not found." });
  const updates = { ...req.body, id: undefined, tenantId: undefined, updatedAt: new Date() };
  delete updates.id;
  delete updates.tenantId;
  await db.update(schema.clients).set(updates).where(
    and(eq(schema.clients.id, String(req.params.id)), eq(schema.clients.tenantId, tenantId))
  );
  const [updated] = await db.select().from(schema.clients).where(
    and(eq(schema.clients.id, String(req.params.id)), eq(schema.clients.tenantId, tenantId))
  );
  return res.json(updated);
});

router.delete("/clients/:id", authenticateToken, requireAdmin, async (req, res) => {
  const tenantId = requireTenant(req);
  const [existing] = await db.select().from(schema.clients).where(
    and(eq(schema.clients.id, String(req.params.id)), eq(schema.clients.tenantId, tenantId))
  );
  if (!existing) return res.status(404).json({ error: "Client not found." });
  await db.delete(schema.clients).where(
    and(eq(schema.clients.id, String(req.params.id)), eq(schema.clients.tenantId, tenantId))
  );
  return res.json({ success: true });
});

export default router;
