import { Router } from "express";
import { db, schema } from "../db/index.js";
import { eq, desc, and } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";
import { requireTenant } from "../lib/tenancy.js";

const router = Router();

// POST /api/gps/checkin — worker GPS check-in
router.post("/gps/checkin", authenticateToken, async (req, res) => {
  try {
    const { workerId, latitude, longitude, accuracy, siteId, checkType } = req.body as {
      workerId: string; latitude: number; longitude: number;
      accuracy?: number; siteId?: string; checkType?: string;
    };
    if (!workerId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "workerId, latitude, and longitude are required" });
    }

    // Confirm the worker belongs to the acting tenant before recording a check-in.
    const tenantId = requireTenant(req);
    const [worker] = await db.select().from(schema.workers).where(
      and(eq(schema.workers.id, workerId), eq(schema.workers.tenantId, tenantId))
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const [checkin] = await db.insert(schema.gpsCheckins).values({
      workerId,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      siteId: siteId ?? null,
      checkType: checkType ?? "check_in",
    }).returning();

    return res.status(201).json({ checkin });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Check-in failed" });
  }
});

// GET /api/gps/checkins/:workerId — worker check-in history
router.get("/gps/checkins/:workerId", authenticateToken, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const workerId = String(req.params.workerId);
    // Confirm tenant ownership before exposing history.
    const [worker] = await db.select().from(schema.workers).where(
      and(eq(schema.workers.id, workerId), eq(schema.workers.tenantId, tenantId))
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const checkins = await db.select().from(schema.gpsCheckins)
      .where(eq(schema.gpsCheckins.workerId, workerId))
      .orderBy(desc(schema.gpsCheckins.timestamp))
      .limit(limit)
      .offset(offset);
    return res.json({ checkins, limit, offset });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load check-ins" });
  }
});

// GET /api/gps/latest — latest check-in for all workers (for map view)
router.get("/gps/latest", authenticateToken, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    // Scan recent check-ins only (bounded) to avoid full-table scan as history grows.
    const scanCap = Math.min(parseInt(String(req.query.scan ?? "2000"), 10) || 2000, 10000);

    // Enrich with worker names — scope workers to the acting tenant and only
    // surface GPS positions for workers owned by that tenant.
    const workers = await db.select({ id: schema.workers.id, name: schema.workers.name, assignedSite: schema.workers.assignedSite })
      .from(schema.workers).where(eq(schema.workers.tenantId, tenantId));
    const workerMap = new Map(workers.map(w => [w.id, w]));

    const allCheckins = await db.select().from(schema.gpsCheckins)
      .orderBy(desc(schema.gpsCheckins.timestamp))
      .limit(scanCap);

    // Group by worker, take latest — filter to current tenant's workers.
    const latestByWorker = new Map<string, typeof allCheckins[0]>();
    for (const c of allCheckins) {
      if (!workerMap.has(c.workerId)) continue;
      if (!latestByWorker.has(c.workerId)) latestByWorker.set(c.workerId, c);
    }

    const locations = Array.from(latestByWorker.values()).map(c => ({
      ...c,
      worker: workerMap.get(c.workerId) ?? { id: c.workerId, name: "Unknown", assignedSite: null },
    }));

    return res.json({ locations, mapboxToken: process.env.MAPBOX_PUBLIC_TOKEN ?? null });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load locations" });
  }
});

// GET /api/gps/config — Mapbox configuration
router.get("/gps/config", (_req, res) => {
  return res.json({
    mapboxToken: process.env.MAPBOX_PUBLIC_TOKEN ?? null,
    configured: !!process.env.MAPBOX_PUBLIC_TOKEN,
  });
});

export default router;
