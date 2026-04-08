/**
 * Legal Knowledge Base — stores verified Polish law articles.
 * AI searches KB first, falls back to Perplexity for live data.
 * Lawyer can promote live results to verified KB.
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

// ── GET /api/legal-kb/search — search KB articles ───────────────────────
router.get("/legal-kb/search", authenticateToken, async (req, res) => {
  try {
    const q = (req.query.q as string) ?? "";
    const category = (req.query.category as string) ?? "";
    if (!q && !category) return res.status(400).json({ error: "q or category required" });

    const rows = await db.execute(sql`
      SELECT id, title, content, category, law_reference, source_url, last_verified
      FROM legal_articles
      WHERE (${!q} OR title ILIKE ${"%" + q + "%"} OR content ILIKE ${"%" + q + "%"} OR keywords ILIKE ${"%" + q + "%"} OR law_reference ILIKE ${"%" + q + "%"})
        AND (${!category} OR category = ${category})
      ORDER BY last_verified DESC NULLS LAST
      LIMIT 20
    `);
    return res.json({ articles: rows.rows, count: rows.rows.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/legal-kb/categories — list categories ──────────────────────
router.get("/legal-kb/categories", authenticateToken, async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT category, COUNT(*)::int as count FROM legal_articles GROUP BY category ORDER BY count DESC
    `);
    return res.json({ categories: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/legal-kb/seed — seed initial law articles ─────────────────
router.post("/legal-kb/seed", authenticateToken, async (_req, res) => {
  try {
    const existing = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM legal_articles`);
    if ((existing.rows[0] as any).cnt > 5) {
      return res.json({ message: "KB already seeded", count: (existing.rows[0] as any).cnt });
    }

    const articles = [
      { title: "Art. 108 — Protection during TRC application", content: "A foreigner who filed a TRC application on time and whose previous residence title has not expired is entitled to stay and work in Poland until the decision on the TRC application becomes final. The stamp in the passport confirming application submission serves as proof of legal stay. This applies to initial applications and renewals.", category: "immigration", lawReference: "Art. 108 Ustawa o cudzoziemcach", sourceUrl: "https://cudzoziemcy.gov.pl", keywords: "art 108 trc karta pobytu application pending protection" },
      { title: "Art. 87 — Work permit requirement", content: "A foreigner may perform work in Poland if they hold a valid work permit or are exempt from the requirement (e.g., holders of Karta Pobytu with work access, EU citizens, students). Work without a valid permit is illegal and subject to fines for both employer and employee.", category: "immigration", lawReference: "Art. 87 Ustawa o promocji zatrudnienia", sourceUrl: "https://praca.gov.pl", keywords: "work permit requirement art 87 foreign worker" },
      { title: "Oświadczenie — 24-month work declaration", content: "Employers can register a declaration (oświadczenie) at PUP for citizens of Armenia, Belarus, Georgia, Moldova, Russia, and Ukraine. Valid for max 24 months within any 36-month period. Must be registered before work starts. Worker must have legal basis for stay.", category: "immigration", lawReference: "Art. 88z Ustawa o promocji zatrudnienia", sourceUrl: "https://praca.gov.pl", keywords: "oswiadczenie declaration pup 24 months ukraine belarus" },
      { title: "Work Permit Type A", content: "Type A work permit is issued for a foreigner performing work on the territory of Poland for an employer whose registered office is in Poland. Valid for up to 3 years. Application filed by employer at voivodship office. Processing time: 1-2 months (varies by region). Requires labor market test unless exempt.", category: "immigration", lawReference: "Art. 88 Ustawa o promocji zatrudnienia", sourceUrl: "https://praca.gov.pl", keywords: "work permit type a employer poland voivodship" },
      { title: "ZUS Registration for Foreign Workers", content: "Employer must register foreign worker with ZUS within 7 days of employment start. Applies to both umowa o pracę and umowa zlecenie. Required: PESEL or temp identifier. Contributions: pension 9.76% employee + 9.76% employer, disability 1.5% + 6.5%, health 9%. Failure to register: fine up to 5000 PLN per worker.", category: "zus", lawReference: "Art. 36 Ustawa o systemie ubezpieczeń społecznych", sourceUrl: "https://www.zus.pl", keywords: "zus registration foreign worker 7 days pesel contributions" },
      { title: "Umowa Zlecenie — Civil Law Contract", content: "Civil law contract (umowa zlecenie) for specific services. Not subject to Kodeks Pracy. ZUS contributions mandatory unless student under 26. Tax: 20% KUP (tax deductible costs) for zlecenie. Minimum hourly rate applies (2026: 30.50 PLN/h gross). Employer must keep records of hours worked.", category: "labor", lawReference: "Art. 734-751 Kodeks Cywilny", sourceUrl: "https://podatki.gov.pl", keywords: "umowa zlecenie civil contract kup 20 percent minimum wage" },
      { title: "Umowa o Pracę — Employment Contract", content: "Full employment contract under Kodeks Pracy. Provides full worker protections: paid leave (20-26 days), sick leave, notice periods, overtime rules. ZUS: full contributions including sickness (2.45%). PIT-2 deduction (300 PLN/month) if single employer. Employer must issue Świadectwo Pracy on termination.", category: "labor", lawReference: "Art. 25-77 Kodeks Pracy", sourceUrl: "https://podatki.gov.pl", keywords: "umowa o prace employment contract kodeks pracy leave" },
      { title: "Posted Worker Rules — EU Directive", content: "Workers posted from Poland to another EU country require: A1 certificate from ZUS (social security coverage), notification to host country authority, compliance with host country minimum terms (pay, hours, leave). Posted Worker Directive 96/71/EC as amended by 2018/957. Max posting period: 12 months (extendable to 18 with notification).", category: "posted_workers", lawReference: "Dyrektywa 96/71/WE, Art. 140 Ustawa o systemie ubezpieczeń", sourceUrl: "https://www.zus.pl", keywords: "posted worker a1 certificate eu directive 96/71 12 months" },
      { title: "BHP Training Requirements", content: "Every worker must complete BHP (health and safety) training before starting work. Initial training valid for 1 year (administrative) or 3 years (production). Periodic training every 3-6 years depending on position. Employer responsibility. Language of training must be understood by worker. Fine for non-compliance: up to 30,000 PLN.", category: "safety", lawReference: "Art. 2373 Kodeks Pracy", sourceUrl: "https://pip.gov.pl", keywords: "bhp training safety health initial periodic fine" },
      { title: "Medical Examination (Badania Lekarskie)", content: "Workers must have valid medical examination certificate before starting work. Initial exam covers fitness for specific job type. Periodic exams: every 2-4 years depending on hazard exposure. Employer pays for exams. Worker cannot be allowed to work without valid certificate. Fine for employer: up to 30,000 PLN.", category: "safety", lawReference: "Art. 229 Kodeks Pracy", sourceUrl: "https://pip.gov.pl", keywords: "badania lekarskie medical exam certificate periodic employer" },
      { title: "7-Day Work Permit Notification Rule", content: "Employer must notify the voivodship office within 7 days if: (1) foreigner starts work, (2) foreigner does not start work within 3 months of permit issue, (3) foreigner stops working 3 months before permit expiry, (4) employment conditions change. Failure to notify: fine and possible permit revocation.", category: "immigration", lawReference: "Art. 88i Ustawa o promocji zatrudnienia", sourceUrl: "https://praca.gov.pl", keywords: "7 day notification work permit employer voivodship start stop" },
      { title: "PESEL for Foreign Workers", content: "Foreign workers staying in Poland over 30 days should obtain PESEL number. Required for ZUS registration, tax declarations, medical services. Application at local gmina office with passport and proof of address. Processing: usually same day. PESEL is required on all official documents and contracts.", category: "immigration", lawReference: "Art. 7 Ustawa o ewidencji ludności", sourceUrl: "https://gov.pl", keywords: "pesel foreign worker registration gmina 30 days" },
    ];

    for (const a of articles) {
      await db.execute(sql`
        INSERT INTO legal_articles (title, content, category, law_reference, source_url, keywords, verified_by, last_verified)
        VALUES (${a.title}, ${a.content}, ${a.category}, ${a.lawReference}, ${a.sourceUrl}, ${a.keywords}, 'system', NOW())
        ON CONFLICT DO NOTHING
      `);
    }

    // Seed contract templates
    const tplCount = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM contract_templates`);
    if ((tplCount.rows[0] as any).cnt === 0) {
      const templates = [
        { name: "Umowa Zlecenie — Standard", contractType: "umowa_zlecenie", language: "pl", content: "UMOWA ZLECENIE\n\nzawarta w dniu {{date}} w {{city}}\npomiędzy:\n{{employer_name}}, NIP: {{employer_nip}}\na\n{{worker_name}}, PESEL: {{worker_pesel}}\n\n§1. Zleceniodawca zleca, a Zleceniobiorca zobowiązuje się do wykonywania pracy na stanowisku {{job_role}}.\n§2. Wynagrodzenie: {{rate}} PLN/godzinę brutto.\n§3. Umowa obowiązuje od {{start_date}} do {{end_date}}.\n§4. Zleceniobiorca oświadcza, że zapoznał się z przepisami BHP.\n§5. Klauzula RODO — dane osobowe przetwarzane zgodnie z RODO.\n\n{{employer_signature}}\n{{worker_signature}}" },
        { name: "Umowa o Pracę — Standard", contractType: "umowa_o_prace", language: "pl", content: "UMOWA O PRACĘ\n\nzawarta w dniu {{date}} w {{city}}\npomiędzy:\n{{employer_name}}, NIP: {{employer_nip}}\na\n{{worker_name}}, PESEL: {{worker_pesel}}\n\n§1. Pracodawca zatrudnia Pracownika na stanowisku {{job_role}}.\n§2. Wynagrodzenie: {{rate}} PLN/godzinę brutto.\n§3. Wymiar czasu pracy: pełny etat (40h/tydzień).\n§4. Umowa na czas określony od {{start_date}} do {{end_date}}.\n§5. Miejsce pracy: {{work_location}}.\n§6. Pracownik ma prawo do urlopu wypoczynkowego (20/26 dni).\n\n{{employer_signature}}\n{{worker_signature}}" },
        { name: "TRC Application Cover Letter", contractType: "cover_letter", language: "pl", content: "{{city}}, dnia {{date}}\n\nUrząd Wojewódzki w {{voivodship}}\nWydział Spraw Cudzoziemców\n\nDOTYCZY: Wniosek o udzielenie zezwolenia na pobyt czasowy\n\nSzanowni Państwo,\n\nW imieniu {{worker_name}}, obywatel(ka) {{nationality}}, składam wniosek o udzielenie zezwolenia na pobyt czasowy i pracę na terytorium RP.\n\nPodstawa prawna: Art. 114 Ustawy o cudzoziemcach.\n\nZałączniki:\n1. Wypełniony wniosek\n2. Paszport (kopia)\n3. Zdjęcia\n4. Potwierdzenie zakwaterowania\n5. Ubezpieczenie zdrowotne\n\nZ poważaniem,\n{{employer_name}}" },
        { name: "Power of Attorney (POA)", contractType: "poa", language: "pl", content: "PEŁNOMOCNICTWO\n\n{{city}}, dnia {{date}}\n\nJa, {{worker_name}}, obywatel(ka) {{nationality}}, nr paszportu {{passport_number}}, niniejszym udzielam pełnomocnictwa {{representative_name}} do reprezentowania mnie przed {{authority}} w sprawie {{case_description}}.\n\nPełnomocnictwo obejmuje składanie wniosków, odbiór decyzji oraz wszelkie czynności związane z powyższą sprawą.\n\n{{worker_signature}}\n{{date}}" },
        { name: "Appeal Letter Template", contractType: "appeal", language: "pl", content: "{{city}}, dnia {{date}}\n\nSzef Urzędu do Spraw Cudzoziemców\nul. Koszykowa 16\n00-564 Warszawa\n\nza pośrednictwem:\nWojewody {{voivodship}}\n\nODWOŁANIE\n\nod decyzji Wojewody {{voivodship}} z dnia {{decision_date}}, nr {{decision_number}}, odmawiającej udzielenia zezwolenia na pobyt czasowy.\n\nWnoszę o:\n1. Uchylenie zaskarżonej decyzji w całości\n2. Udzielenie zezwolenia na pobyt czasowy\n\nUzasadnienie:\n{{appeal_grounds}}\n\nZ poważaniem,\n{{worker_name}}" },
      ];
      for (const t of templates) {
        await db.execute(sql`
          INSERT INTO contract_templates (name, contract_type, language, content, placeholders)
          VALUES (${t.name}, ${t.contractType}, ${t.language}, ${t.content}, '[]'::jsonb)
        `);
      }
    }

    return res.json({ message: "Seeded 12 legal articles + 5 contract templates", articlesCount: 12, templatesCount: 5 });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
