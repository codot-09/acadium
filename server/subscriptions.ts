import { invokeLLM } from "./_core/llm";

export const INDIVIDUAL_PRICE_UZS = 99_000;
export const INDIVIDUAL_DURATION_DAYS = 31;
export const CLICK_PAYMENT_URL = "https://my.click.uz/clickp2p/65D764DEBC1A88669CD322BDA7ED0DD78039F1E642BFFD41D866DAD78C4AD5D6";
export const ENTERPRISE_CONTACT = "https://t.me/otabek_nabiyev1";
export const RECEIPT_ANALYSIS_VERSION = "click-v2";

export type ReceiptAnalysis = {
  approved: boolean;
  amount: number;
  currency: string;
  confidence: number;
  reason: string;
  paymentStatus: "success" | "pending" | "failed" | "refunded" | "unknown";
  recipient: string;
  transactionId: string;
  paidAt: string;
  evidence: string[];
  fraudSignals: string[];
  analysisVersion: string;
};

function contentText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter(item => typeof item === "object" && item && "type" in item && item.type === "text").map(item => (item as { text?: string }).text ?? "").join("\n");
  return "";
}

function safeDate(value: string) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
}

export async function analyzeIndividualReceipt(input: { url: string; mimeType: string }): Promise<ReceiptAnalysis> {
  const visualPart = input.mimeType === "application/pdf"
    ? { type: "file_url" as const, file_url: { url: input.url, mime_type: "application/pdf" as const } }
    : { type: "image_url" as const, image_url: { url: input.url, detail: "high" as const } };
  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are a strict payment-forensics verifier for Acadium. Inspect only the visible evidence in this Uzbek Click receipt. Never guess or fill missing fields. Approve is not a model decision: extract facts and signals so the server can decide. A valid receipt must visibly show a completed/successful payment, exactly 99000 UZS, a recipient or payment reference associated with the intended Acadium Click destination, a transaction/reference ID, and a payment date. Mark pending, failed, refunded, cancelled, unreadable, edited-looking, duplicated-looking, mismatched, or unrelated receipts as unsafe. Put every concern in fraudSignals and cite short visible facts in evidence." },
      { role: "user", content: [{ type: "text", text: "Extract the receipt facts as strict JSON. Use an empty string when a fact is not visible, and never infer it." }, visualPart] },
    ],
    response_format: { type: "json_schema", json_schema: { name: "acadium_click_receipt_forensics", strict: true, schema: { type: "object", properties: {
      approved: { type: "boolean" },
      amount: { type: "integer" },
      currency: { type: "string" },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
      reason: { type: "string" },
      paymentStatus: { type: "string", enum: ["success", "pending", "failed", "refunded", "unknown"] },
      recipient: { type: "string" },
      transactionId: { type: "string" },
      paidAt: { type: "string" },
      evidence: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 8 },
      fraudSignals: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 8 },
    }, required: ["approved", "amount", "currency", "confidence", "reason", "paymentStatus", "recipient", "transactionId", "paidAt", "evidence", "fraudSignals"], additionalProperties: false } } },
    maxTokens: 600,
  });
  const raw = contentText(response.choices[0]?.message?.content);
  const parsed = JSON.parse(raw) as Partial<ReceiptAnalysis>;
  const currency = String(parsed.currency ?? "").trim().toUpperCase();
  const paymentStatus = ["success", "pending", "failed", "refunded", "unknown"].includes(String(parsed.paymentStatus)) ? parsed.paymentStatus as ReceiptAnalysis["paymentStatus"] : "unknown";
  const recipient = String(parsed.recipient ?? "").trim();
  const transactionId = String(parsed.transactionId ?? "").trim();
  const paidAt = String(parsed.paidAt ?? "").trim();
  const evidence = Array.isArray(parsed.evidence) ? parsed.evidence.map(String).filter(Boolean).slice(0, 8) : [];
  const fraudSignals = Array.isArray(parsed.fraudSignals) ? parsed.fraudSignals.map(String).filter(Boolean).slice(0, 8) : [];
  const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 0));
  const approved = paymentStatus === "success" && Number(parsed.amount) === INDIVIDUAL_PRICE_UZS && ["UZS", "SUM", "СУМ"].includes(currency) && confidence >= 90 && Boolean(recipient) && Boolean(transactionId) && Boolean(safeDate(paidAt)) && evidence.length >= 2 && fraudSignals.length === 0;
  const reason = approved ? String(parsed.reason || "Visible Click receipt evidence passed all server checks.") : `Receipt rejected or requires manual review: ${String(parsed.reason || "required payment evidence was not fully visible")}`;
  return { approved, amount: Number(parsed.amount) || 0, currency, confidence, reason, paymentStatus, recipient, transactionId, paidAt, evidence, fraudSignals, analysisVersion: RECEIPT_ANALYSIS_VERSION };
}
