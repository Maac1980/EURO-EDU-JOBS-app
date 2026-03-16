import { Router } from "express";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const NOTES_FILE = join(__dirname, "../../data/worker-notes.json");

interface NoteEntry {
  content: string;
  updatedAt: string;
  updatedBy: string;
}

function readNotes(): Record<string, NoteEntry> {
  if (!existsSync(NOTES_FILE)) return {};
  try { return JSON.parse(readFileSync(NOTES_FILE, "utf-8")); }
  catch { return {}; }
}

function writeNotes(data: Record<string, NoteEntry>): void {
  mkdirSync(join(__dirname, "../../data"), { recursive: true });
  writeFileSync(NOTES_FILE, JSON.stringify(data, null, 2));
}

router.get("/workers/:id/notes", authenticateToken, (req, res) => {
  const id = String(req.params.id);
  const notes = readNotes();
  res.json(notes[id] ?? { content: "", updatedAt: null, updatedBy: null });
});

router.post("/workers/:id/notes", authenticateToken, (req, res) => {
  const id = String(req.params.id);
  const { content } = req.body as { content?: string };
  const actor = req.user?.email ?? req.user?.id ?? "operator";
  const notes = readNotes();
  notes[id] = {
    content: (content ?? "").slice(0, 4000),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  writeNotes(notes);
  res.json({ success: true, note: notes[id] });
});

router.delete("/workers/:id/notes", authenticateToken, (req, res) => {
  const id = String(req.params.id);
  const notes = readNotes();
  delete notes[id];
  writeNotes(notes);
  res.json({ success: true });
});

export default router;
