import { Router } from "express";
import PDFDocument from "pdfkit";
import { db, schema } from "../db/index.js";
import { and, eq, desc } from "drizzle-orm";
import { authenticateToken, requireAdmin, requireCoordinatorOrAdmin } from "../lib/authMiddleware.js";
import { requireTenant } from "../lib/tenancy.js";

const router = Router();

function generateInvoiceNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `EEJ-${y}${m}-${rand}`;
}

// GET /api/invoices
router.get("/invoices", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const tenantId = requireTenant(req);
    const invoices = await db.select({
      invoice: schema.invoices,
      client: schema.clients,
    }).from(schema.invoices)
      .innerJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
      .where(eq(schema.invoices.tenantId, tenantId))
      .orderBy(desc(schema.invoices.createdAt))
      .limit(limit)
      .offset(offset);
    return res.json({ invoices: invoices.map(i => ({ ...i.invoice, client: i.client })), limit, offset });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load invoices" });
  }
});

// POST /api/invoices — create invoice
router.post("/invoices", authenticateToken, requireCoordinatorOrAdmin, async (req, res) => {
  try {
    const body = req.body;
    const items = body.items as Array<{ amount: number }>;
    const subtotal = items.reduce((sum: number, item) => sum + item.amount, 0);
    const vatRate = body.vatRate ?? 0.23;
    const vatAmount = subtotal * vatRate;
    const total = subtotal + vatAmount;

    const tenantId = requireTenant(req);
    const [invoice] = await db.insert(schema.invoices).values({
      invoiceNumber: generateInvoiceNumber(),
      clientId: body.clientId,
      monthYear: body.monthYear,
      items: body.items,
      subtotal: subtotal.toString(),
      vatRate: vatRate.toString(),
      vatAmount: vatAmount.toString(),
      total: total.toString(),
      dueDate: body.dueDate,
      notes: body.notes,
      tenantId,
    }).returning();

    return res.status(201).json({ invoice });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create invoice" });
  }
});

// PATCH /api/invoices/:id/status
router.patch("/invoices/:id/status", authenticateToken, async (req, res) => {
  try {
    const { status } = req.body as { status: string };
    const updates: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === "paid") updates.paidAt = new Date();

    const tenantId = requireTenant(req);
    const [updated] = await db.update(schema.invoices).set(updates)
      .where(and(eq(schema.invoices.id, String(req.params.id)), eq(schema.invoices.tenantId, tenantId))).returning();
    if (!updated) return res.status(404).json({ error: "Invoice not found" });
    return res.json({ invoice: updated });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update invoice" });
  }
});

// GET /api/invoices/:id/pdf — generate Polish invoice PDF (Faktura VAT)
router.get("/invoices/:id/pdf", authenticateToken, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const [invoice] = await db.select().from(schema.invoices).where(
      and(eq(schema.invoices.id, String(req.params.id)), eq(schema.invoices.tenantId, tenantId))
    );
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, invoice.clientId));

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Faktura_${invoice.invoiceNumber}.pdf"`);
    doc.pipe(res);

    // Header
    doc.font("Helvetica-Bold").fontSize(24).text("FAKTURA VAT", { align: "center" });
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(12).text(`Nr: ${invoice.invoiceNumber}`, { align: "center" });
    doc.text(`Data wystawienia: ${new Date(invoice.createdAt).toLocaleDateString("pl-PL")}`, { align: "center" });
    if (invoice.dueDate) doc.text(`Termin platnosci: ${invoice.dueDate}`, { align: "center" });
    doc.moveDown();

    // Seller / Buyer
    doc.font("Helvetica-Bold").fontSize(11).text("Sprzedawca:", 40);
    doc.font("Helvetica").fontSize(10).text("EURO EDU JOBS Sp. z o.o.");
    doc.text("edu-jobs.eu");
    doc.moveDown();

    if (client) {
      doc.font("Helvetica-Bold").fontSize(11).text("Nabywca:");
      doc.font("Helvetica").fontSize(10).text(client.name);
      if (client.address) doc.text(client.address);
      if (client.nip) doc.text(`NIP: ${client.nip}`);
    }
    doc.moveDown();

    // Items table
    const items = invoice.items as Array<{ workerName?: string; hours?: number; rate?: number; amount?: number }>;
    const tableTop = doc.y;
    const colWidths = [200, 60, 80, 80, 80];
    const headers = ["Pracownik", "Godziny", "Stawka", "Kwota netto", "VAT"];

    doc.font("Helvetica-Bold").fontSize(9);
    let x = 40;
    headers.forEach((h, i) => { doc.text(h, x, tableTop, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown();

    doc.font("Helvetica").fontSize(9);
    const vatRateVal = Number(invoice.vatRate ?? 0.23);
    for (const item of items) {
      x = 40;
      const y = doc.y;
      doc.text(item.workerName || "-", x, y, { width: colWidths[0] }); x += colWidths[0];
      doc.text(String(item.hours || 0), x, y, { width: colWidths[1] }); x += colWidths[1];
      doc.text(`${(item.rate || 0).toFixed(2)} zl`, x, y, { width: colWidths[2] }); x += colWidths[2];
      doc.text(`${(item.amount || 0).toFixed(2)} zl`, x, y, { width: colWidths[3] }); x += colWidths[3];
      doc.text(`${((item.amount || 0) * vatRateVal).toFixed(2)} zl`, x, y, { width: colWidths[4] });
      doc.moveDown(0.5);
    }

    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(11);
    doc.text(`Netto: ${Number(invoice.subtotal).toFixed(2)} zl`, { align: "right" });
    doc.text(`VAT (${(vatRateVal * 100).toFixed(0)}%): ${Number(invoice.vatAmount).toFixed(2)} zl`, { align: "right" });
    doc.fontSize(14).text(`RAZEM BRUTTO: ${Number(invoice.total).toFixed(2)} zl`, { align: "right" });

    if (invoice.notes) {
      doc.moveDown();
      doc.font("Helvetica").fontSize(9).text(`Uwagi: ${invoice.notes}`);
    }

    doc.end();
    return;
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate invoice PDF" });
    return;
  }
});

// DELETE /api/invoices/:id
router.delete("/invoices/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    await db.delete(schema.invoices).where(
      and(eq(schema.invoices.id, String(req.params.id)), eq(schema.invoices.tenantId, tenantId))
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete invoice" });
  }
});

export default router;
