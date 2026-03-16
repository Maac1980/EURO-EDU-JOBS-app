import { Router } from "express";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { authenticateToken, requireAdmin, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const CLIENTS_FILE = join(DATA_DIR, "clients.json");

export interface Client {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  nip: string;
  billingRate: number | null;
  notes: string;
  createdAt: string;
}

function readClients(): Client[] {
  try {
    if (existsSync(CLIENTS_FILE)) {
      return JSON.parse(readFileSync(CLIENTS_FILE, "utf-8")).clients as Client[];
    }
  } catch {}
  return [];
}

function writeClients(clients: Client[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CLIENTS_FILE, JSON.stringify({ clients }, null, 2));
}

// GET /api/clients
router.get("/clients", authenticateToken, async (_req, res) => {
  return res.json({ clients: readClients() });
});

// POST /api/clients
router.post("/clients", authenticateToken, requireCoordinatorOrAdmin, (req, res) => {
  const { name, contactPerson, email, phone, address, nip, billingRate, notes } = req.body as Partial<Client>;
  if (!name) return res.status(400).json({ error: "Client name is required." });
  const newClient: Client = {
    id: randomUUID(),
    name: name.trim(),
    contactPerson: (contactPerson ?? "").trim(),
    email: (email ?? "").trim(),
    phone: (phone ?? "").trim(),
    address: (address ?? "").trim(),
    nip: (nip ?? "").trim(),
    billingRate: typeof billingRate === "number" ? billingRate : null,
    notes: (notes ?? "").trim(),
    createdAt: new Date().toISOString().slice(0, 10),
  };
  writeClients([...readClients(), newClient]);
  return res.status(201).json(newClient);
});

// PATCH /api/clients/:id
router.patch("/clients/:id", authenticateToken, requireCoordinatorOrAdmin, (req, res) => {
  const clients = readClients();
  const idx = clients.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Client not found." });
  const updates = req.body as Partial<Client>;
  const updated = { ...clients[idx], ...updates, id: clients[idx].id };
  clients[idx] = updated;
  writeClients(clients);
  return res.json(updated);
});

// DELETE /api/clients/:id
router.delete("/clients/:id", authenticateToken, requireAdmin, (req, res) => {
  const clients = readClients();
  if (!clients.find((c) => c.id === req.params.id)) return res.status(404).json({ error: "Client not found." });
  writeClients(clients.filter((c) => c.id !== req.params.id));
  return res.json({ success: true });
});

export default router;
