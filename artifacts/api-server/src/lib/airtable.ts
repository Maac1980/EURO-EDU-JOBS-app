const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;

// The user may paste a full Airtable URL like:
//   appXXX/tblXXX/viwXXX?blocks=hide
// or just a base ID. Extract both base and table IDs automatically.
function parseAirtableIds(raw: string | undefined): { baseId: string | undefined; tableId: string | undefined } {
  if (!raw) return { baseId: undefined, tableId: undefined };
  const baseMatch = raw.match(/(app[a-zA-Z0-9]{10,})/);
  const tableMatch = raw.match(/(tbl[a-zA-Z0-9]{10,})/);
  return {
    baseId: baseMatch ? baseMatch[1] : undefined,
    tableId: tableMatch ? tableMatch[1] : undefined,
  };
}

const { baseId: AIRTABLE_BASE_ID, tableId: EXTRACTED_TABLE_ID } = parseAirtableIds(process.env.AIRTABLE_BASE_ID);

// Table: explicit env var wins, then table ID extracted from the base URL, then fallback name
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || EXTRACTED_TABLE_ID || "Welders";

console.log(`[airtable] Base: ${AIRTABLE_BASE_ID} | Table: ${AIRTABLE_TABLE_NAME}`);

const BASE_URL = "https://api.airtable.com/v0";

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

export interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

function headers() {
  if (!AIRTABLE_API_KEY) {
    throw new Error("AIRTABLE_API_KEY environment variable is not set");
  }
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function fetchAllRecords(): Promise<AirtableRecord[]> {
  if (!AIRTABLE_BASE_ID) {
    throw new Error("AIRTABLE_BASE_ID environment variable is not set");
  }

  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(
      `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`
    );
    if (offset) url.searchParams.set("offset", offset);
    url.searchParams.set("pageSize", "100");

    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as AirtableResponse;
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

export async function fetchRecord(id: string): Promise<AirtableRecord> {
  if (!AIRTABLE_BASE_ID) {
    throw new Error("AIRTABLE_BASE_ID environment variable is not set");
  }

  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${id}`;
  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  return (await res.json()) as AirtableRecord;
}

export async function updateRecord(
  id: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord> {
  if (!AIRTABLE_BASE_ID) {
    throw new Error("AIRTABLE_BASE_ID environment variable is not set");
  }

  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  return (await res.json()) as AirtableRecord;
}

export async function deleteRecord(recordId: string): Promise<void> {
  if (!AIRTABLE_BASE_ID) {
    throw new Error("AIRTABLE_BASE_ID environment variable is not set");
  }
  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${recordId}`;
  const res = await fetch(url, { method: "DELETE", headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
}

export async function createRecord(fields: Record<string, unknown>): Promise<AirtableRecord> {
  if (!AIRTABLE_BASE_ID) {
    throw new Error("AIRTABLE_BASE_ID environment variable is not set");
  }
  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
  return (await res.json()) as AirtableRecord;
}

export interface AirtableField {
  id: string;
  name: string;
  type: string;
}

export interface TableSchema {
  id: string;
  name: string;
  fields: AirtableField[];
}

export async function getTableSchema(): Promise<TableSchema> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    throw new Error("Airtable credentials are not set");
  }
  const url = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable meta error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { tables: TableSchema[] };
  let table = data.tables.find(
    (t) => t.name === AIRTABLE_TABLE_NAME ||
      t.id === process.env.AIRTABLE_TABLE_NAME
  ) ?? data.tables[0];
  if (!table) throw new Error("Table not found in Airtable base");
  return table;
}

const EEJ_DESIRED_FIELDS: Array<{ name: string; type: string; options?: Record<string, unknown> }> = [
  { name: "Job Role", type: "singleLineText" },
  { name: "Experience", type: "singleLineText" },
  { name: "Qualification", type: "singleLineText" },
  { name: "Assigned Site", type: "singleLineText" },
  { name: "Email", type: "email" },
  { name: "Phone", type: "phoneNumber" },
  // ── Payroll fields ────────────────────────────────────────────────────────
  { name: "HOURLY NETTO RATE", type: "currency", options: { precision: 2, symbol: "zł" } },
  { name: "TOTAL HOURS", type: "number", options: { precision: 1 } },
  { name: "ADVANCE PAYMENT", type: "currency", options: { precision: 2, symbol: "zł" } },
  { name: "PENALTIES", type: "currency", options: { precision: 2, symbol: "zł" } },
  // ── Polish legal compliance fields ────────────────────────────────────────
  { name: "BADANIA LEKARSKIE", type: "date", options: { dateFormat: { name: "iso" } } },
  { name: "OSWIADCZENIE EXPIRY", type: "date", options: { dateFormat: { name: "iso" } } },
  { name: "ISO9606 PROCESS", type: "singleLineText" },
  { name: "ISO9606 MATERIAL", type: "singleLineText" },
  { name: "ISO9606 THICKNESS", type: "singleLineText" },
  { name: "ISO9606 POSITION", type: "singleLineText" },
  { name: "PESEL", type: "singleLineText" },
  { name: "NIP", type: "singleLineText" },
  { name: "ZUS STATUS", type: "singleLineText" },
  { name: "UDT CERT EXPIRY", type: "date", options: { dateFormat: { name: "iso" } } },
  { name: "VISA TYPE", type: "singleLineText" },
  { name: "RODO CONSENT", type: "date", options: { dateFormat: { name: "iso" } } },
];

export async function ensureEejSchema(): Promise<{ created: string[]; existing: string[]; errors: string[] }> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    throw new Error("AIRTABLE_API_KEY is required to manage schema");
  }

  const schema = await getTableSchema();
  const existingNames = new Set(schema.fields.map((f) => f.name.toLowerCase()));

  const created: string[] = [];
  const existing: string[] = [];
  const errors: string[] = [];

  const createUrl = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables/${schema.id}/fields`;

  for (const desired of EEJ_DESIRED_FIELDS) {
    if (existingNames.has(desired.name.toLowerCase())) {
      existing.push(desired.name);
      continue;
    }
    const body: Record<string, unknown> = { name: desired.name, type: desired.type };
    if (desired.options) body.options = desired.options;

    try {
      const res = await fetch(createUrl, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        errors.push(`${desired.name}: ${text.slice(0, 120)}`);
      } else {
        created.push(desired.name);
      }
    } catch (e) {
      errors.push(`${desired.name}: ${(e as Error).message}`);
    }
  }

  return { created, existing, errors };
}

export async function uploadAttachmentToRecord(
  recordId: string,
  fieldName: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<void> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    throw new Error("Airtable credentials are not set");
  }

  const contentUrl = `https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;

  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: mimeType }), filename);
  form.append("filename", filename);
  form.append("contentType", mimeType);

  const res = await fetch(contentUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable upload error ${res.status}: ${text}`);
  }
}
