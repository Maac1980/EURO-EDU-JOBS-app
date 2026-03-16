import { Router } from "express";
import PDFDocument from "pdfkit";
import { fetchAllRecords } from "../lib/airtable.js";
import { mapRecordToWorker } from "../lib/compliance.js";
import { MOCK_WORKERS, isMockMode } from "../lib/mockData.js";
import { checkAndAlert, sendWorkerExpiryReminders, getLastAlertStatus } from "../lib/alerter.js";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

export interface DocumentRecord {
  id: string;
  workerId: string;
  workerName: string;
  documentType: string;
  expiryDate: string;
  daysRemaining: number;
  zone: "green" | "yellow" | "red" | "expired";
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function toZone(days: number): "green" | "yellow" | "red" | "expired" {
  if (days < 0) return "expired";
  if (days < 30) return "red";
  if (days < 60) return "yellow";
  return "green";
}

router.get("/compliance/documents", async (_req, res) => {
  try {
    let workers;
    if (isMockMode()) {
      workers = MOCK_WORKERS;
    } else {
      const records = await fetchAllRecords();
      workers = records.map(mapRecordToWorker);
    }

    const documents: DocumentRecord[] = [];
    let idCounter = 0;

    for (const w of workers) {
      const docs: Array<{ type: string; date: string | null }> = [
        { type: "TRC Residence Card", date: w.trcExpiry },
        { type: "Work Permit", date: w.workPermitExpiry },
        { type: "Contract End Date", date: w.contractEndDate },
      ];
      if (w.bhpStatus && /\d{4}/.test(w.bhpStatus)) {
        docs.push({ type: "BHP Certificate", date: w.bhpStatus });
      }

      for (const doc of docs) {
        if (!doc.date) continue;
        const days = daysUntil(doc.date);
        if (days === null) continue;
        documents.push({
          id: `${w.id}-${idCounter++}`,
          workerId: w.id,
          workerName: w.name,
          documentType: doc.type,
          expiryDate: doc.date,
          daysRemaining: days,
          zone: toZone(days),
        });
      }
    }

    const zoneOrder = { expired: 0, red: 1, yellow: 2, green: 3 };
    documents.sort((a, b) => {
      const zo = zoneOrder[a.zone] - zoneOrder[b.zone];
      return zo !== 0 ? zo : a.daysRemaining - b.daysRemaining;
    });

    return res.json({
      documents,
      summary: {
        total: documents.length,
        expired: documents.filter((d) => d.zone === "expired").length,
        red: documents.filter((d) => d.zone === "red").length,
        yellow: documents.filter((d) => d.zone === "yellow").length,
        green: documents.filter((d) => d.zone === "green").length,
      },
    });
  } catch (err) {
    console.error("[compliance] Error fetching documents:", err);
    return res.status(500).json({ error: "Failed to load compliance data." });
  }
});

// GET /api/compliance/trend
// Returns 8 weekly snapshots reconstructed from current expiry dates.
// For each past week we ask: "on that Monday, what was each doc's status?"
router.get("/compliance/trend", async (_req, res) => {
  try {
    let workers;
    if (isMockMode()) {
      workers = MOCK_WORKERS;
    } else {
      const records = await fetchAllRecords();
      workers = records.map(mapRecordToWorker);
    }

    const WEEKS = 8;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Find the most recent Monday
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon…
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastMonday = new Date(now);
    lastMonday.setDate(lastMonday.getDate() - daysToLastMonday);

    const snapshots: Array<{ week: string; date: string; red: number; yellow: number; green: number; total: number }> = [];

    for (let i = WEEKS - 1; i >= 0; i--) {
      const weekStart = new Date(lastMonday);
      weekStart.setDate(weekStart.getDate() - i * 7);

      let red = 0, yellow = 0, green = 0;

      for (const w of workers) {
        const dates = [w.trcExpiry, w.workPermitExpiry, w.contractEndDate].filter(Boolean) as string[];
        let workerStatus: "red" | "yellow" | "green" | null = null;

        for (const dateStr of dates) {
          const expiry = new Date(dateStr);
          if (isNaN(expiry.getTime())) continue;
          expiry.setHours(0, 0, 0, 0);
          const daysLeft = Math.ceil((expiry.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));

          let docZone: "red" | "yellow" | "green";
          if (daysLeft < 0) docZone = "red";       // already expired at this snapshot
          else if (daysLeft < 30) docZone = "red";
          else if (daysLeft < 60) docZone = "yellow";
          else docZone = "green";

          // Worst document wins
          if (docZone === "red") { workerStatus = "red"; break; }
          if (docZone === "yellow") workerStatus = "yellow";
          if (docZone === "green" && workerStatus === null) workerStatus = "green";
        }

        // Workers with no expiry dates count as compliant
        if (workerStatus === null) workerStatus = "green";

        if (workerStatus === "red") red++;
        else if (workerStatus === "yellow") yellow++;
        else green++;
      }

      const label = `W${WEEKS - i}`; // W1…W8
      const dateLabel = weekStart.toLocaleDateString("pl-PL", { day: "2-digit", month: "short" });

      snapshots.push({
        week: label,
        date: dateLabel,
        red,
        yellow,
        green,
        total: red + yellow + green,
      });
    }

    return res.json({ snapshots, weeks: WEEKS });
  } catch (err) {
    console.error("[compliance] Error building trend:", err);
    return res.status(500).json({ error: "Failed to build compliance trend." });
  }
});

// ─── PDF helpers ───────────────────────────────────────────────────────────

const LIME   = "#E9FF70";
const DARK   = "#1A1A2E";
const MID    = "#2D2D4A";
const WHITE  = "#FFFFFF";
const GREY   = "#8892A4";
const RED    = "#EF4444";
const YELLOW = "#F59E0B";
const GREEN  = "#22C55E";

const STATUS_COLOR: Record<string, string> = {
  critical: RED,
  warning: YELLOW,
  compliant: GREEN,
  "non-compliant": RED,
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysLabel(days: number | null): string {
  if (days === null || days === undefined) return "—";
  if (days < 0) return `${Math.abs(days)}d expired`;
  return `${days}d left`;
}

// GET /api/compliance/report/pdf?site=<optional>
router.get("/compliance/report/pdf", async (req, res) => {
  try {
    let workers;
    if (isMockMode()) {
      workers = MOCK_WORKERS;
    } else {
      const records = await fetchAllRecords();
      workers = records.map(mapRecordToWorker);
    }

    const siteFilter = typeof req.query.site === "string" && req.query.site ? req.query.site : null;
    if (siteFilter) {
      workers = workers.filter((w) => w.siteLocation?.toLowerCase() === siteFilter.toLowerCase());
    }

    // Sort: critical first, then warning, then rest
    const order: Record<string, number> = { "non-compliant": 0, critical: 1, warning: 2, compliant: 3 };
    workers.sort((a, b) => (order[a.complianceStatus] ?? 9) - (order[b.complianceStatus] ?? 9));

    const doc = new PDFDocument({ margin: 0, size: "A4", bufferPages: true });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="EEJ_Compliance_Report_${new Date().toISOString().slice(0, 10)}.pdf"`
    );
    doc.pipe(res);

    const PAGE_W = doc.page.width;
    const PAGE_H = doc.page.height;
    const MARGIN = 40;
    const COL_W = PAGE_W - MARGIN * 2;
    const NOW = new Date();

    // ── HEADER BLOCK ──────────────────────────────────────────────────────
    doc.rect(0, 0, PAGE_W, 110).fill(DARK);

    // Lime accent stripe
    doc.rect(0, 0, 6, 110).fill(LIME);

    // EEJ square logo
    doc.roundedRect(MARGIN, 22, 56, 56, 8).fill(LIME);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(DARK)
       .text("EEJ", MARGIN, 44, { width: 56, align: "center" });

    // Title
    doc.font("Helvetica-Bold").fontSize(22).fillColor(WHITE)
       .text("EURO EDU JOBS", MARGIN + 68, 24);
    doc.font("Helvetica").fontSize(10).fillColor(LIME)
       .text("COMPLIANCE MASTER REPORT", MARGIN + 68, 50);
    doc.font("Helvetica").fontSize(9).fillColor(GREY)
       .text(`Generated: ${NOW.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} at ${NOW.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, MARGIN + 68, 68);
    if (siteFilter) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(LIME)
         .text(`Site filter: ${siteFilter}`, MARGIN + 68, 84);
    }

    // Page number (top right)
    doc.font("Helvetica").fontSize(8).fillColor(GREY)
       .text("CONFIDENTIAL — EEJ INTERNAL USE ONLY", PAGE_W - MARGIN - 200, 48, { width: 200, align: "right" });

    let y = 128;

    // ── SUMMARY PILLS ─────────────────────────────────────────────────────
    const total     = workers.length;
    const critical  = workers.filter((w) => w.complianceStatus === "critical").length;
    const warning   = workers.filter((w) => w.complianceStatus === "warning").length;
    const compliant = workers.filter((w) => w.complianceStatus === "compliant").length;
    const nonComp   = workers.filter((w) => w.complianceStatus === "non-compliant").length;

    const pills = [
      { label: "TOTAL WORKFORCE", value: String(total),    color: WHITE,  bg: MID    },
      { label: "CRITICAL (<30d)", value: String(critical),  color: RED,    bg: "#2D1A1A" },
      { label: "WARNING (<60d)",  value: String(warning),   color: YELLOW, bg: "#2D2710" },
      { label: "COMPLIANT",       value: String(compliant), color: GREEN,  bg: "#0D2016" },
      { label: "NON-COMPLIANT",   value: String(nonComp),   color: RED,    bg: "#2D1A1A" },
    ];

    const pillW = (COL_W - 12) / pills.length;
    pills.forEach((p, i) => {
      const px = MARGIN + i * (pillW + 3);
      doc.roundedRect(px, y, pillW, 62, 6).fill(p.bg);
      doc.font("Helvetica").fontSize(7).fillColor(GREY)
         .text(p.label, px + 6, y + 10, { width: pillW - 12 });
      doc.font("Helvetica-Bold").fontSize(26).fillColor(p.color)
         .text(p.value, px + 6, y + 22, { width: pillW - 12 });
    });

    y += 80;

    // ── SECTION TITLE ─────────────────────────────────────────────────────
    doc.rect(MARGIN, y, COL_W, 22).fill(MID);
    doc.rect(MARGIN, y, 3, 22).fill(LIME);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE)
       .text("WORKER COMPLIANCE OVERVIEW", MARGIN + 12, y + 7);
    y += 30;

    // ── TABLE HEADER ──────────────────────────────────────────────────────
    const cols = {
      name:    { x: MARGIN,       w: 130 },
      role:    { x: MARGIN + 132, w: 72  },
      trc:     { x: MARGIN + 206, w: 74  },
      permit:  { x: MARGIN + 282, w: 74  },
      bhp:     { x: MARGIN + 358, w: 58  },
      status:  { x: MARGIN + 418, w: 76  },
    };

    // Header row
    doc.rect(MARGIN, y, COL_W, 18).fill("#252540");
    Object.entries(cols).forEach(([key, col]) => {
      const labels: Record<string, string> = { name: "WORKER", role: "JOB ROLE", trc: "TRC EXPIRY", permit: "WORK PERMIT", bhp: "BHP", status: "STATUS" };
      doc.font("Helvetica-Bold").fontSize(7).fillColor(LIME)
         .text(labels[key], col.x + 4, y + 5, { width: col.w - 4 });
    });
    y += 18;

    // ── TABLE ROWS ────────────────────────────────────────────────────────
    const ROW_H = 22;

    for (let wi = 0; wi < workers.length; wi++) {
      const w = workers[wi];
      const rowBg = wi % 2 === 0 ? "#1A1A2E" : "#1E1E36";

      // Page break
      if (y + ROW_H > PAGE_H - 60) {
        doc.addPage();
        y = MARGIN;
        // Repeat header
        doc.rect(MARGIN, y, COL_W, 18).fill("#252540");
        Object.entries(cols).forEach(([key, col]) => {
          const labels: Record<string, string> = { name: "WORKER", role: "JOB ROLE", trc: "TRC EXPIRY", permit: "WORK PERMIT", bhp: "BHP", status: "STATUS" };
          doc.font("Helvetica-Bold").fontSize(7).fillColor(LIME)
             .text(labels[key], col.x + 4, y + 5, { width: col.w - 4 });
        });
        y += 18;
      }

      doc.rect(MARGIN, y, COL_W, ROW_H).fill(rowBg);

      // Left status accent bar for critical/non-compliant
      if (w.complianceStatus === "critical" || w.complianceStatus === "non-compliant") {
        doc.rect(MARGIN, y, 3, ROW_H).fill(RED);
      } else if (w.complianceStatus === "warning") {
        doc.rect(MARGIN, y, 3, ROW_H).fill(YELLOW);
      }

      const textY = y + 7;
      const statusColor = STATUS_COLOR[w.complianceStatus] ?? WHITE;

      doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE)
         .text(w.name, cols.name.x + 6, textY, { width: cols.name.w - 6, ellipsis: true });
      doc.font("Helvetica").fontSize(7).fillColor(GREY)
         .text(w.specialization || "—", cols.role.x + 4, textY, { width: cols.role.w - 4, ellipsis: true });
      doc.font("Helvetica").fontSize(7).fillColor(WHITE)
         .text(fmtDate(w.trcExpiry), cols.trc.x + 4, textY, { width: cols.trc.w - 4 });
      doc.font("Helvetica").fontSize(7).fillColor(WHITE)
         .text(fmtDate(w.workPermitExpiry), cols.permit.x + 4, textY, { width: cols.permit.w - 4 });
      doc.font("Helvetica").fontSize(7).fillColor(WHITE)
         .text(w.bhpStatus || "—", cols.bhp.x + 4, textY, { width: cols.bhp.w - 4 });

      // Status pill
      doc.roundedRect(cols.status.x + 4, y + 4, cols.status.w - 8, 14, 3).fill(statusColor + "22");
      doc.font("Helvetica-Bold").fontSize(7).fillColor(statusColor)
         .text(w.complianceStatus.toUpperCase(), cols.status.x + 4, textY, { width: cols.status.w - 8, align: "center" });

      // Days until next expiry (sub-text under name)
      if (w.daysUntilNextExpiry !== null) {
        doc.font("Helvetica").fontSize(6.5).fillColor(statusColor)
           .text(daysLabel(w.daysUntilNextExpiry), cols.name.x + 6, y + 14, { width: cols.name.w - 6 });
      }

      y += ROW_H;
    }

    // ── FOOTER ────────────────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const footerY = PAGE_H - 36;
      doc.rect(0, footerY, PAGE_W, 36).fill(DARK);
      doc.rect(0, footerY, PAGE_W, 1).fill(LIME);
      doc.font("Helvetica").fontSize(7).fillColor(GREY)
         .text("EURO EDU JOBS — Compliance Portal", MARGIN, footerY + 12);
      doc.font("Helvetica").fontSize(7).fillColor(GREY)
         .text(`Page ${i + 1} of ${range.count}`, PAGE_W - MARGIN - 60, footerY + 12, { width: 60, align: "right" });
      doc.font("Helvetica").fontSize(7).fillColor(GREY)
         .text("edu-jobs.eu", PAGE_W / 2 - 30, footerY + 12, { width: 60, align: "center" });
    }

    doc.end();
  } catch (err) {
    console.error("[compliance] PDF generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate PDF report." });
    }
  }
});

// GET /api/compliance/zus-export — CSV for ZUS declarations (PESEL, NIP, hours, contract type)
router.get("/compliance/zus-export", authenticateToken, async (_req, res) => {
  try {
    let workers;
    if (isMockMode()) {
      workers = MOCK_WORKERS;
    } else {
      const records = await fetchAllRecords();
      workers = records.map(mapRecordToWorker);
    }
    const rows: string[] = [
      "Imię i Nazwisko,PESEL,NIP,Typ Umowy,Stawka Godzinowa (zł),Godziny,Kwota Brutto (zł),ZUS Status,Lokacja"
    ];
    for (const w of workers) {
      const brutto = (w.hourlyNettoRate ?? 0) * (w.totalHours ?? 0);
      const row = [
        w.name ?? "",
        w.pesel ?? "",
        w.nip ?? "",
        w.contractType ?? "",
        w.hourlyNettoRate ?? "",
        w.totalHours ?? "",
        brutto.toFixed(2),
        w.zusStatus ?? "",
        w.siteLocation ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
      rows.push(row);
    }
    const csv = rows.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ZUS_Export_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send("\uFEFF" + csv);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "ZUS export failed." });
  }
});

// POST /api/compliance/trigger-worker-reminders — manually send expiry reminders to workers
router.post("/compliance/trigger-worker-reminders", authenticateToken, async (_req, res) => {
  try {
    const result = await sendWorkerExpiryReminders();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send reminders." });
  }
});

// POST /api/compliance/trigger-alert
// testMode=true → includes ALL documents regardless of zone so you get the email even if everything is fine
// ── GET /api/compliance/alert-status ─────────────────────────────────────────
// Returns the persisted result from the most recent scheduled or manual compliance scan
router.get("/compliance/alert-status", authenticateToken, (_req, res) => {
  const status = getLastAlertStatus();
  if (!status) return res.json({ ran: false, message: "No compliance scan has run yet this session." });
  return res.json({ ran: true, ...status });
});

router.post("/compliance/trigger-alert", async (req, res) => {
  const testMode = req.body?.testMode !== false; // defaults to true
  console.log(`[compliance] Manual alert trigger — testMode=${testMode}`);
  const result = await checkAndAlert(testMode);
  return res.json(result);
});

export default router;
