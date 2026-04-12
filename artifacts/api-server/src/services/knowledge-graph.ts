/**
 * Knowledge Graph Service — relational memory for EEJ legal patterns.
 *
 * PostgreSQL JSONB adjacency list — no external graph DB.
 *
 * GRAPH STRUCTURE:
 *   Nodes: Worker, Document, LegalStatute, DecisionResult, Urząd (Voivodeship)
 *   Edges: HAS, TRIGGERS, BASED_ON, FILED_AT, RESULTED_IN, APPLIES_TO
 *
 * Every verified document creates graph relationships.
 * Pattern search finds similar historical cases.
 * AI can traverse the graph to reason about new cases.
 *
 * POST /api/legal/patterns/search — find similar cases
 * GET  /api/legal/patterns/stats — graph statistics
 * GET  /api/legal/patterns/worker/:workerId — worker's knowledge subgraph
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken } from "../lib/authMiddleware.js";

const router = Router();

// ═══ GRAPH SCHEMA ═══════════════════════════════════════════════════════════

type NodeType = "WORKER" | "DOCUMENT" | "LEGAL_STATUTE" | "DECISION_RESULT" | "URZAD" | "EMPLOYER" | "CASE_PATTERN";
type EdgeType = "HAS" | "TRIGGERS" | "BASED_ON" | "FILED_AT" | "RESULTED_IN" | "APPLIES_TO" | "EMPLOYS" | "SIMILAR_TO";

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  properties: Record<string, any>;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: EdgeType;
  weight: number;
  properties: Record<string, any>;
}

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensureGraphTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS kg_nodes (
      id TEXT PRIMARY KEY,
      node_type TEXT NOT NULL,
      label TEXT NOT NULL,
      properties JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS kg_edges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
      edge_type TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      properties JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(source_id, target_id, edge_type)
    )
  `);

  // Index for fast traversal
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON kg_edges(source_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON kg_edges(target_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_kg_edges_type ON kg_edges(edge_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON kg_nodes(node_type)`);

  // Pattern memory table — stores discovered patterns for AI retrieval
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS kg_patterns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pattern_type TEXT NOT NULL,
      description TEXT NOT NULL,
      conditions JSONB DEFAULT '{}'::jsonb,
      outcome TEXT NOT NULL,
      frequency INT DEFAULT 1,
      confidence REAL DEFAULT 0.5,
      example_worker_ids JSONB DEFAULT '[]'::jsonb,
      legal_articles JSONB DEFAULT '[]'::jsonb,
      voivodeships JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ═══ NODE OPERATIONS ════════════════════════════════════════════════════════

async function upsertNode(id: string, type: NodeType, label: string, properties: Record<string, any> = {}): Promise<void> {
  await db.execute(sql`
    INSERT INTO kg_nodes (id, node_type, label, properties)
    VALUES (${id}, ${type}, ${label}, ${JSON.stringify(properties)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      label = ${label},
      properties = kg_nodes.properties || ${JSON.stringify(properties)}::jsonb,
      updated_at = NOW()
  `);
}

async function upsertEdge(sourceId: string, targetId: string, edgeType: EdgeType, weight = 1.0, properties: Record<string, any> = {}): Promise<void> {
  await db.execute(sql`
    INSERT INTO kg_edges (source_id, target_id, edge_type, weight, properties)
    VALUES (${sourceId}, ${targetId}, ${edgeType}, ${weight}, ${JSON.stringify(properties)}::jsonb)
    ON CONFLICT (source_id, target_id, edge_type) DO UPDATE SET
      weight = kg_edges.weight + 0.1,
      properties = kg_edges.properties || ${JSON.stringify(properties)}::jsonb
  `);
}

// ═══ GRAPH SYNC — called after document verification ════════════════════════

export async function syncToGraph(params: {
  workerId: string;
  workerName: string;
  nationality: string;
  docId: string;
  docType: string;
  extractedData: Record<string, any>;
  legalImpact: Record<string, any>;
  legalArticles: string[];
  voivodeship?: string;
  employerName?: string;
  isRejection: boolean;
  isApplication: boolean;
}): Promise<{ nodesCreated: number; edgesCreated: number }> {
  await ensureGraphTables();

  const { workerId, workerName, nationality, docId, docType, extractedData, legalImpact, legalArticles, voivodeship, employerName, isRejection, isApplication } = params;

  let nodesCreated = 0;
  let edgesCreated = 0;

  // 1. Worker node
  const workerNodeId = `worker:${workerId}`;
  await upsertNode(workerNodeId, "WORKER", workerName, { nationality, workerId });
  nodesCreated++;

  // 2. Document node
  const docNodeId = `doc:${docId}`;
  await upsertNode(docNodeId, "DOCUMENT", `${docType} — ${workerName}`, {
    docType,
    extractedData,
    isRejection,
    isApplication,
    verifiedAt: new Date().toISOString(),
  });
  nodesCreated++;

  // 3. Worker -> HAS -> Document
  await upsertEdge(workerNodeId, docNodeId, "HAS", 1.0, { docType });
  edgesCreated++;

  // 4. Decision Result node
  const resultStatus = legalImpact.currentStatus ?? "UNKNOWN";
  const resultNodeId = `result:${docId}`;
  await upsertNode(resultNodeId, "DECISION_RESULT", `${resultStatus} — ${docType}`, {
    legalStatus: resultStatus,
    riskLevel: legalImpact.riskLevel,
    art108: legalImpact.art108Applied,
    docType,
  });
  nodesCreated++;

  // 5. Document -> TRIGGERS -> DecisionResult
  await upsertEdge(docNodeId, resultNodeId, "TRIGGERS", 1.0, {
    riskLevel: legalImpact.riskLevel,
  });
  edgesCreated++;

  // 6. Legal Statute nodes
  for (const article of legalArticles) {
    const statuteId = `statute:${article.replace(/\s+/g, "_").toLowerCase()}`;
    await upsertNode(statuteId, "LEGAL_STATUTE", article, {
      article,
      frequency: 1,
    });
    nodesCreated++;

    // DecisionResult -> BASED_ON -> LegalStatute
    await upsertEdge(resultNodeId, statuteId, "BASED_ON", 1.0, { docType });
    edgesCreated++;

    // LegalStatute -> APPLIES_TO -> Worker
    await upsertEdge(statuteId, workerNodeId, "APPLIES_TO", 0.5);
    edgesCreated++;
  }

  // 7. Voivodeship (Urząd) node
  if (voivodeship) {
    const urzadId = `urzad:${voivodeship.toLowerCase().replace(/\s+/g, "_")}`;
    await upsertNode(urzadId, "URZAD", `Urząd Wojewódzki — ${voivodeship}`, { voivodeship });
    nodesCreated++;

    // Document -> FILED_AT -> Urząd
    await upsertEdge(docNodeId, urzadId, "FILED_AT", 1.0, { docType });
    edgesCreated++;
  }

  // 8. Employer node
  if (employerName) {
    const empId = `employer:${employerName.toLowerCase().replace(/\s+/g, "_").substring(0, 50)}`;
    await upsertNode(empId, "EMPLOYER", employerName, { employerName });
    nodesCreated++;

    // Employer -> EMPLOYS -> Worker
    await upsertEdge(empId, workerNodeId, "EMPLOYS", 1.0);
    edgesCreated++;
  }

  // 9. Update/create pattern memory
  await learnPattern(params);

  return { nodesCreated, edgesCreated };
}

// ═══ PATTERN LEARNING ═══════════════════════════════════════════════════════

async function learnPattern(params: {
  workerId: string;
  docType: string;
  legalImpact: Record<string, any>;
  legalArticles: string[];
  voivodeship?: string;
  isRejection: boolean;
  nationality: string;
}) {
  const { workerId, docType, legalImpact, legalArticles, voivodeship, isRejection, nationality } = params;

  const patternType = isRejection ? "REJECTION" : `${docType}_OUTCOME`;
  const outcome = legalImpact.currentStatus ?? "UNKNOWN";
  const conditions = { docType, nationality, riskLevel: legalImpact.riskLevel, art108: legalImpact.art108Applied };

  // Check if similar pattern exists
  const existing = await db.execute(sql`
    SELECT id, frequency, example_worker_ids FROM kg_patterns
    WHERE pattern_type = ${patternType}
      AND outcome = ${outcome}
      AND conditions @> ${JSON.stringify({ docType, nationality })}::jsonb
    LIMIT 1
  `);

  if (existing.rows.length > 0) {
    const row = existing.rows[0] as any;
    const existingWorkers = Array.isArray(row.example_worker_ids) ? row.example_worker_ids : [];
    if (!existingWorkers.includes(workerId)) existingWorkers.push(workerId);
    const cappedWorkers = existingWorkers.slice(-20);

    await db.execute(sql`
      UPDATE kg_patterns
      SET frequency = frequency + 1,
          confidence = LEAST(1.0, confidence + 0.05),
          example_worker_ids = ${JSON.stringify(cappedWorkers)}::jsonb,
          updated_at = NOW()
      WHERE id = ${row.id}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO kg_patterns (pattern_type, description, conditions, outcome, frequency, confidence,
        example_worker_ids, legal_articles, voivodeships)
      VALUES (
        ${patternType},
        ${`${docType} for ${nationality} worker resulted in ${outcome}`},
        ${JSON.stringify(conditions)}::jsonb,
        ${outcome},
        1,
        0.3,
        ${JSON.stringify([workerId])}::jsonb,
        ${JSON.stringify(legalArticles)}::jsonb,
        ${JSON.stringify(voivodeship ? [voivodeship] : [])}::jsonb
      )
    `);
  }
}

// ═══ PATTERN SEARCH ═════════════════════════════════════════════════════════

router.post("/legal/patterns/search", authenticateToken, async (req, res) => {
  try {
    await ensureGraphTables();
    const { query: searchQuery, docType, voivodeship, nationality, outcome } = req.body as {
      query?: string; docType?: string; voivodeship?: string; nationality?: string; outcome?: string;
    };

    // Build conditions filter
    const conditionsFilter: Record<string, any> = {};
    if (docType) conditionsFilter.docType = docType;
    if (nationality) conditionsFilter.nationality = nationality;

    // Search patterns
    let patternRows;
    if (Object.keys(conditionsFilter).length > 0) {
      patternRows = await db.execute(sql`
        SELECT * FROM kg_patterns
        WHERE conditions @> ${JSON.stringify(conditionsFilter)}::jsonb
        ${outcome ? sql`AND outcome = ${outcome}` : sql``}
        ORDER BY frequency DESC, confidence DESC
        LIMIT 20
      `);
    } else {
      patternRows = await db.execute(sql`
        SELECT * FROM kg_patterns
        ORDER BY frequency DESC, confidence DESC
        LIMIT 20
      `);
    }

    // If voivodeship filter, further narrow
    let patterns = patternRows.rows as any[];
    if (voivodeship) {
      patterns = patterns.filter(p => {
        const vs = Array.isArray(p.voivodeships) ? p.voivodeships : [];
        return vs.some((v: string) => v.toLowerCase().includes(voivodeship.toLowerCase()));
      });
    }

    // AI-powered semantic search if query text provided
    let aiInsight: string | null = null;
    if (searchQuery && patterns.length > 0) {
      try {
        const mod = await import("@anthropic-ai/sdk");
        const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });

        const patternSummary = patterns.slice(0, 10).map((p, i) =>
          `${i + 1}. ${p.description} (freq: ${p.frequency}, confidence: ${Math.round(p.confidence * 100)}%, outcome: ${p.outcome})`
        ).join("\n");

        const resp = await client.messages.create({
          model: "claude-sonnet-4-20250514", max_tokens: 600,
          system: "You analyze immigration case patterns for a Polish staffing agency. Answer based only on provided pattern data. Be specific and practical.",
          messages: [{ role: "user", content: `HISTORICAL PATTERNS:\n${patternSummary}\n\nQUESTION: ${searchQuery}\n\nProvide a practical analysis based on these patterns.` }],
        });
        aiInsight = resp.content[0]?.type === "text" ? resp.content[0].text : null;
      } catch { /* AI optional */ }
    }

    // Graph traversal — find related nodes
    let relatedNodes: any[] = [];
    if (docType) {
      const nodeRows = await db.execute(sql`
        SELECT DISTINCT n.id, n.node_type, n.label, n.properties
        FROM kg_nodes n
        JOIN kg_edges e ON (e.source_id = n.id OR e.target_id = n.id)
        WHERE n.properties->>'docType' = ${docType}
           OR n.node_type = 'LEGAL_STATUTE'
        LIMIT 20
      `);
      relatedNodes = nodeRows.rows as any[];
    }

    return res.json({
      patterns,
      totalMatches: patterns.length,
      aiInsight,
      relatedNodes,
      searchCriteria: { docType, voivodeship, nationality, outcome, query: searchQuery },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══ GRAPH STATS ════════════════════════════════════════════════════════════

router.get("/legal/patterns/stats", authenticateToken, async (_req, res) => {
  try {
    await ensureGraphTables();

    const nodeCount = await db.execute(sql`SELECT node_type, COUNT(*)::int as count FROM kg_nodes GROUP BY node_type ORDER BY count DESC`);
    const edgeCount = await db.execute(sql`SELECT edge_type, COUNT(*)::int as count FROM kg_edges GROUP BY edge_type ORDER BY count DESC`);
    const patternCount = await db.execute(sql`SELECT COUNT(*)::int as count FROM kg_patterns`);
    const topPatterns = await db.execute(sql`SELECT pattern_type, description, frequency, confidence, outcome FROM kg_patterns ORDER BY frequency DESC LIMIT 10`);
    const topStatutes = await db.execute(sql`
      SELECT n.label, COUNT(e.id)::int as references
      FROM kg_nodes n
      JOIN kg_edges e ON e.target_id = n.id
      WHERE n.node_type = 'LEGAL_STATUTE'
      GROUP BY n.label
      ORDER BY references DESC
      LIMIT 10
    `);

    return res.json({
      graph: {
        nodes: nodeCount.rows,
        edges: edgeCount.rows,
        totalNodes: (nodeCount.rows as any[]).reduce((s, r) => s + r.count, 0),
        totalEdges: (edgeCount.rows as any[]).reduce((s, r) => s + r.count, 0),
      },
      patterns: {
        total: (patternCount.rows[0] as any)?.count ?? 0,
        top: topPatterns.rows,
      },
      topLegalStatutes: topStatutes.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══ WORKER SUBGRAPH ════════════════════════════════════════════════════════

router.get("/legal/patterns/worker/:workerId", authenticateToken, async (req, res) => {
  try {
    await ensureGraphTables();
    const wid = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const nodeId = `worker:${wid}`;

    // 1-hop: direct connections
    const directEdges = await db.execute(sql`
      SELECT e.*,
        s.node_type as source_type, s.label as source_label,
        t.node_type as target_type, t.label as target_label
      FROM kg_edges e
      JOIN kg_nodes s ON s.id = e.source_id
      JOIN kg_nodes t ON t.id = e.target_id
      WHERE e.source_id = ${nodeId} OR e.target_id = ${nodeId}
      ORDER BY e.created_at DESC
    `);

    // 2-hop: connections of connections (for pattern discovery)
    const twoHopNodes = await db.execute(sql`
      SELECT DISTINCT n2.id, n2.node_type, n2.label, n2.properties
      FROM kg_edges e1
      JOIN kg_edges e2 ON (e2.source_id = e1.target_id OR e2.target_id = e1.source_id)
      JOIN kg_nodes n2 ON (n2.id = e2.source_id OR n2.id = e2.target_id)
      WHERE (e1.source_id = ${nodeId} OR e1.target_id = ${nodeId})
        AND n2.id != ${nodeId}
        AND n2.node_type IN ('LEGAL_STATUTE', 'URZAD', 'DECISION_RESULT')
      LIMIT 30
    `);

    // Worker's patterns
    const workerPatterns = await db.execute(sql`
      SELECT * FROM kg_patterns
      WHERE example_worker_ids @> ${JSON.stringify([wid])}::jsonb
      ORDER BY frequency DESC
    `);

    return res.json({
      workerId: wid,
      directConnections: directEdges.rows,
      extendedNetwork: twoHopNodes.rows,
      patterns: workerPatterns.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
