import { Router } from "express";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

router.get("/workers/:id/notes", authenticateToken, async (req, res) => {
  const [note] = await db.select().from(schema.workerNotes).where(eq(schema.workerNotes.workerId, String(req.params.id)));
  res.json(note ?? { content: "", updatedAt: null, updatedBy: null });
});

router.post("/workers/:id/notes", authenticateToken, async (req, res) => {
  const { content } = req.body as { content?: string };
  const actor = req.user?.email ?? req.user?.id ?? "operator";
  const [existing] = await db.select().from(schema.workerNotes).where(eq(schema.workerNotes.workerId, String(req.params.id)));

  if (existing) {
    await db.update(schema.workerNotes).set({
      content: (content ?? "").slice(0, 4000),
      updatedBy: actor,
      updatedAt: new Date(),
    }).where(eq(schema.workerNotes.id, existing.id));
  } else {
    await db.insert(schema.workerNotes).values({
      workerId: String(req.params.id),
      content: (content ?? "").slice(0, 4000),
      updatedBy: actor,
    });
  }
  const [note] = await db.select().from(schema.workerNotes).where(eq(schema.workerNotes.workerId, String(req.params.id)));
  res.json({ success: true, note });
});

router.delete("/workers/:id/notes", authenticateToken, async (req, res) => {
  await db.delete(schema.workerNotes).where(eq(schema.workerNotes.workerId, String(req.params.id)));
  res.json({ success: true });
});

export default router;
