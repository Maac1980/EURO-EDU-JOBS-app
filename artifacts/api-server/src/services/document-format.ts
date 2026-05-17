/**
 * Document format normalization for the smart-ingest pipeline.
 *
 * Real workers and team members upload documents in whatever format they
 * have at hand — iPhone HEIC photos, PDFs of work permits scanned by a
 * shop owner, DOCX templates emailed by a lawyer. Claude Vision only
 * accepts JPG/PNG/GIF/WebP natively, so anything else must be converted
 * server-side before the API call.
 *
 * Design choices (Alpine-safe, no binary nightmare):
 *  - PDF → text extraction via pdf-parse. Pure JS. Handles text-based
 *    PDFs (the dominant real-world case for EEJ — Polish gov-issued work
 *    permits, TRC cards, BHP certs, contracts are all text PDFs).
 *    Image-only / scanned PDFs would need canvas-based rendering, which
 *    on node:alpine requires GraphicsMagick or @napi-rs/canvas — both add
 *    Dockerfile complexity. For Tier 1, scanned PDFs return a friendly
 *    "re-upload as JPG/PNG" message rather than dragging in 100MB of
 *    binary deps. Tracked as a Tier 2 polish if Layer 2 shows real
 *    workers uploading scans.
 *  - HEIC → JPG via heic-convert. Pure JS / libheif WASM. Sharp's HEIF
 *    support requires libheif at compile time which isn't guaranteed on
 *    Alpine prebuilds, so we use the dedicated lib.
 *  - DOCX → text via mammoth. Pure JS. Extracts plain text — documents
 *    in DOCX don't have a visual layout that helps OCR; the text is
 *    what matters.
 *  - JPG/PNG/GIF/WebP → passthrough as image (current behavior).
 *  - Anything else → throw FriendlyError so the caller can surface a
 *    human-readable message instead of leaking a raw API error.
 *
 * The output is a discriminated union the caller plugs straight into the
 * Anthropic Messages content array.
 */

// pdf-parse v2 ships ESM with named exports; v1 was CJS with default export.
// Import as namespace and pick the right callable to be version-agnostic.
import * as pdfParseModule from "pdf-parse";
import mammoth from "mammoth";
// heic-convert has no types — declare-module shim at bottom of file.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — see ambient module declaration below
import heicConvert from "heic-convert";

const pdfParse: (data: Buffer) => Promise<{ text: string; numpages: number }> =
  (pdfParseModule as any).default ?? (pdfParseModule as any).pdf ?? (pdfParseModule as any);

/**
 * Friendly errors travel up to the route handler, which maps them to a
 * normalized HTTP response (Step 2 of the upload-pipeline goal). The
 * `code` is the machine handle the frontend can switch on; `message` is
 * the human-readable string shown to the user.
 */
export class FriendlyError extends Error {
  constructor(public code: string, message: string, public httpStatus: number = 400) {
    super(message);
    this.name = "FriendlyError";
  }
}

/** Discriminated union — what the Claude Vision call needs in content[]. */
export type NormalizedContent =
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; base64: string; sourceFormat: string }
  | { kind: "text";  text: string; sourceFormat: string; pageCount?: number };

const CLAUDE_VISION_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
]);

/**
 * Detect the canonical format from MIME + extension hints. Browsers send
 * varying MIME values (especially for HEIC — some send `image/heic`,
 * some `image/heif`, some empty). Falling back to extension catches
 * cases where the browser couldn't ID the type.
 */
function detectFormat(mimeType: string | undefined, fileName: string | undefined): string {
  const mime = (mimeType ?? "").toLowerCase().trim();
  const ext = (fileName ?? "").toLowerCase().split(".").pop() ?? "";

  if (CLAUDE_VISION_TYPES.has(mime)) return mime === "image/jpg" ? "image/jpeg" : mime;
  if (mime === "application/pdf") return "application/pdf";
  if (mime === "image/heic" || mime === "image/heif") return "image/heic";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mime === "application/msword") return "application/docx";

  // Extension fallback for empty/wrong MIME
  switch (ext) {
    case "jpg": case "jpeg": return "image/jpeg";
    case "png":  return "image/png";
    case "gif":  return "image/gif";
    case "webp": return "image/webp";
    case "pdf":  return "application/pdf";
    case "heic": case "heif": return "image/heic";
    case "docx": case "doc": return "application/docx";
    case "txt":  return "text/plain";
    case "rtf":  return "application/rtf";
  }
  return "unknown";
}

/**
 * Main entry — turn an arbitrary uploaded file into Claude-Vision-ready
 * content. Throws FriendlyError for unsupported / unreadable input.
 *
 * @param base64 — the raw base64 (no data: prefix)
 * @param mimeType — declared MIME from the upload
 * @param fileName — optional original name, used for extension fallback
 */
export async function normalizeForClaudeVision(
  base64: string,
  mimeType: string | undefined,
  fileName: string | undefined,
): Promise<NormalizedContent | NormalizedContent[]> {
  if (!base64 || base64.length === 0) {
    throw new FriendlyError("EMPTY_FILE", "We didn't receive any file content. Please try again.", 400);
  }

  const format = detectFormat(mimeType, fileName);
  const buf = Buffer.from(base64, "base64");

  // Reasonable safety cap. Claude limits us anyway; failing fast here is
  // friendlier than waiting for a timeout. 25 MB covers a typical 10-page
  // scanned PDF or any HEIC from a modern phone.
  const MAX_BYTES = 25 * 1024 * 1024;
  if (buf.byteLength > MAX_BYTES) {
    throw new FriendlyError(
      "FILE_TOO_LARGE",
      "This file is too large. Please compress it or split it into smaller pages and try again.",
      413,
    );
  }

  switch (format) {
    case "image/jpeg":
    case "image/png":
    case "image/gif":
    case "image/webp":
      return { kind: "image", mediaType: format as NormalizedContent extends { kind: "image"; mediaType: infer M } ? M : never, base64, sourceFormat: format };

    case "image/heic":
      try {
        // heic-convert wants an ArrayBuffer; node Buffer is one (kind of) but
        // the typed-array view is what the lib actually reads.
        const jpegBuffer = await heicConvert({
          buffer: buf as unknown as ArrayBufferLike,
          format: "JPEG",
          quality: 0.85,
        });
        return {
          kind: "image",
          mediaType: "image/jpeg",
          base64: Buffer.from(jpegBuffer).toString("base64"),
          sourceFormat: "image/heic",
        };
      } catch (err) {
        // Most likely cause: file isn't actually HEIC despite the name/MIME.
        // Surface a friendly message rather than the libheif stack trace.
        console.warn("[document-format] HEIC conversion failed:", err instanceof Error ? err.message : err);
        throw new FriendlyError(
          "HEIC_DECODE_FAILED",
          "We couldn't read this HEIC photo. Try opening it on your phone and re-sharing as JPG, or take a fresh photo.",
          415,
        );
      }

    case "application/pdf":
      try {
        const parsed = await pdfParse(buf);
        const text = (parsed.text ?? "").trim();
        const pages = parsed.numpages ?? 1;
        // Text below this threshold ≈ a scanned (image-only) PDF where the
        // text layer is empty or filler whitespace. We don't have canvas-
        // based rendering on Alpine, so we cleanly fail-forward.
        const TEXT_MIN_CHARS = 50;
        if (text.length < TEXT_MIN_CHARS) {
          throw new FriendlyError(
            "PDF_SCAN_NOT_SUPPORTED",
            "This PDF looks like a scan with no extractable text. Please re-upload it as a JPG or PNG photo of each page, or use a phone camera to take a clear picture.",
            415,
          );
        }
        return {
          kind: "text",
          text,
          sourceFormat: "application/pdf",
          pageCount: pages,
        };
      } catch (err) {
        if (err instanceof FriendlyError) throw err;
        console.warn("[document-format] PDF parse failed:", err instanceof Error ? err.message : err);
        throw new FriendlyError(
          "PDF_PARSE_FAILED",
          "We couldn't read this PDF. It may be encrypted, password-protected, or corrupted. Try re-saving the file and uploading again.",
          415,
        );
      }

    case "application/docx":
      try {
        const result = await mammoth.extractRawText({ buffer: buf });
        const text = (result.value ?? "").trim();
        if (text.length < 10) {
          throw new FriendlyError(
            "DOCX_EMPTY",
            "This Word document appears to be empty. Please check the file and re-upload.",
            415,
          );
        }
        return { kind: "text", text, sourceFormat: "application/docx" };
      } catch (err) {
        if (err instanceof FriendlyError) throw err;
        console.warn("[document-format] DOCX parse failed:", err instanceof Error ? err.message : err);
        throw new FriendlyError(
          "DOCX_PARSE_FAILED",
          "We couldn't read this Word document. It may be password-protected or use an older format. Try saving it as PDF and re-uploading.",
          415,
        );
      }

    case "text/plain":
    case "application/rtf":
      // Plain text formats — supported as text content.
      try {
        const text = buf.toString("utf-8").trim();
        if (text.length < 10) {
          throw new FriendlyError("TEXT_EMPTY", "This text file appears to be empty.", 415);
        }
        return { kind: "text", text, sourceFormat: format };
      } catch {
        throw new FriendlyError("TEXT_DECODE_FAILED", "We couldn't read this text file.", 415);
      }

    case "unknown":
    default:
      throw new FriendlyError(
        "UNSUPPORTED_FORMAT",
        "We can't process this file format. Please upload a PDF, photo (JPG/PNG/HEIC), or Word document.",
        415,
      );
  }
}

/**
 * Map any error — friendly or raw — to a normalized response shape the
 * frontend can render cleanly. Raw Anthropic API errors get logged
 * server-side (with full detail) but never reach the user verbatim.
 *
 * The returned object is intended to be sent as `res.status(httpStatus).json(body)`.
 *
 * Item 2.2-followup-BE — `domain` lets callers tell the helper which
 * route surface they're on, so the fallback `userMessage` (for errors
 * that don't match any specific Anthropic SDK pattern) doesn't leak
 * upload-domain copy ("Something went wrong reading this file") onto
 * regulatory / legal routes. Some pattern-matched messages also adapt
 * their wording per domain (e.g. AI_TIMEOUT, AI_TOO_LARGE) where the
 * upload-specific phrasing doesn't fit.
 *
 * Default `'generic'` preserves call-site backward compatibility for any
 * caller that hasn't specified a domain yet.
 */
export type FriendlyErrorDomain = 'upload' | 'regulatory' | 'legal' | 'generic';

const GENERIC_FALLBACK_MESSAGES: Record<FriendlyErrorDomain, string> = {
  upload:     "Something went wrong reading this file. Please try again or contact support if it keeps happening.",
  regulatory: "Something went wrong loading regulatory data. Please try again.",
  legal:      "Something went wrong processing your legal request. Please try again.",
  generic:    "Something went wrong. Please try again or contact support.",
};

// Per-domain phrasing for the two pattern-matched messages whose upload-
// wording bleeds into non-upload routes. Other matchers (AI_RATE_LIMITED,
// AI_AUTH, AI_FORMAT_REJECTED) keep their original copy across domains —
// rate limits and auth issues read fine everywhere; AI_FORMAT_REJECTED
// only fires on upload paths in practice.
const TIMEOUT_MESSAGES: Record<FriendlyErrorDomain, string> = {
  upload:     "The AI took too long to read this file. Please try again or upload a smaller version.",
  regulatory: "The AI took too long to load regulatory data. Please try again.",
  legal:      "The AI took too long to process your request. Please try again.",
  generic:    "The AI took too long. Please try again.",
};

const TOO_LARGE_MESSAGES: Record<FriendlyErrorDomain, string> = {
  upload:     "This file is too large for the AI to process. Please split it into smaller pieces and try again.",
  regulatory: "The regulatory data was too large for the AI to process. Please narrow the scope and try again.",
  legal:      "The legal request was too large for the AI to process. Please narrow the scope and try again.",
  generic:    "The request was too large for the AI to process. Please try a smaller request.",
};

export function mapErrorToFriendlyResponse(
  err: unknown,
  domain: FriendlyErrorDomain = 'generic',
): { httpStatus: number; body: { error: string; code: string; userMessage: string } } {
  if (err instanceof FriendlyError) {
    return {
      httpStatus: err.httpStatus,
      body: { error: err.message, code: err.code, userMessage: err.message },
    };
  }

  // Anthropic SDK errors have predictable structure. Pattern-match on
  // common signatures rather than expose the raw message (which is full
  // of internal field paths like "messages.0.content.0.image.source.base64.media_type").
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("media_type") || lower.includes("image.source") || lower.includes("invalid base64")) {
    return {
      httpStatus: 415,
      body: {
        error: message,
        code: "AI_FORMAT_REJECTED",
        userMessage: "We couldn't read this file. Please try a clearer photo, a PDF, or a JPG.",
      },
    };
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return {
      httpStatus: 429,
      body: {
        error: message,
        code: "AI_RATE_LIMITED",
        userMessage: "The AI is busy right now. Please try again in a moment.",
      },
    };
  }
  if (lower.includes("timeout") || lower.includes("etimedout")) {
    return {
      httpStatus: 504,
      body: {
        error: message,
        code: "AI_TIMEOUT",
        userMessage: TIMEOUT_MESSAGES[domain],
      },
    };
  }
  if (lower.includes("too large") || lower.includes("max_tokens")) {
    return {
      httpStatus: 413,
      body: {
        error: message,
        code: "AI_TOO_LARGE",
        userMessage: TOO_LARGE_MESSAGES[domain],
      },
    };
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401")) {
    return {
      httpStatus: 503,
      body: {
        error: message,
        code: "AI_AUTH",
        userMessage: "The AI service isn't configured correctly. Please contact support.",
      },
    };
  }

  // Generic fallback — never leak the raw message. Per-domain copy
  // chosen so non-upload routes don't talk about "this file."
  return {
    httpStatus: 500,
    body: {
      error: message,
      code: "AI_UNKNOWN",
      userMessage: GENERIC_FALLBACK_MESSAGES[domain],
    },
  };
}

// heic-convert ambient declaration lives in src/types/external-modules.d.ts
// (TS won't accept augmentation of an untyped module inline in a TS file).
