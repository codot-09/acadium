import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_EXTRACTED_CHARS = 120_000;

export function safeSourceName(name: string) {
  const normalized = name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/-+\./g, ".").replace(/^-|-$/g, "").slice(0, 180);
  return normalized || "source-file";
}

function trimExtractedText(text: string) {
  return text.replace(/\u0000/g, "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, MAX_EXTRACTED_CHARS);
}

export async function extractSourceText(buffer: Buffer, mimeType: string, fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (mimeType.startsWith("text/") || /\.(txt|md|markdown|csv|json)$/i.test(lowerName)) {
    return trimExtractedText(buffer.toString("utf8"));
  }
  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return trimExtractedText(result.text);
    } finally {
      await parser.destroy();
    }
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || lowerName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return trimExtractedText(result.value);
  }
  throw new Error("Unsupported file type. Upload PDF, DOCX, TXT, Markdown, CSV or JSON.");
}

export const SUPPORTED_SOURCE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;

export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export function validateSourceUpload(input: { filename: string; mimeType: string; sizeBytes: number }) {
  if (!input.filename.trim() || !input.mimeType.trim()) return { status: 400, error: "filename and mimeType are required" } as const;
  if (!isSupportedSourceType(input.mimeType, input.filename)) return { status: 415, error: "Unsupported file type. Upload PDF, DOCX, TXT, Markdown, CSV or JSON." } as const;
  if (input.sizeBytes > MAX_SOURCE_BYTES) return { status: 413, error: "File is too large. Maximum size is 15 MB." } as const;
  return null;
}

export function isSupportedSourceType(mimeType: string, fileName: string) {
  return SUPPORTED_SOURCE_TYPES.includes(mimeType as (typeof SUPPORTED_SOURCE_TYPES)[number]) || /\.(pdf|docx|txt|md|markdown|csv|json)$/i.test(fileName);
}

export function sourcePromptContext(sources: Array<{ name: string; mimeType: string; extractedText: string | null }>) {
  let remaining = 48_000;
  return sources.flatMap(source => {
    if (!source.extractedText || remaining <= 0) return [];
    const excerpt = source.extractedText.slice(0, remaining);
    remaining -= excerpt.length;
    return [`SOURCE: ${source.name} (${source.mimeType})\n${excerpt}`];
  }).join("\n\n---\n\n");
}

export type SourceMode = "web" | "local";
export type SourceRecord = { id: string; name: string; mimeType: string; extractedText: string | null };

export function modeInstruction(mode: SourceMode) {
  return mode === "local"
    ? "LOCAL MODE: Use only the attached teacher sources below. Do not use general web knowledge, do not invent facts, and say clearly when the sources do not contain the answer."
    : "WEB MODE: Use general internet knowledge as usual. Teacher files are not authoritative in this mode.";
}
