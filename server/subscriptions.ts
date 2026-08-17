import { invokeLLM } from "./_core/llm";

export const INDIVIDUAL_PRICE_UZS = 99_000;
export const INDIVIDUAL_DURATION_DAYS = 31;
export const CLICK_PAYMENT_URL = "https://my.click.uz/clickp2p/65D764DEBC1A88669CD322BDA7ED0DD78039F1E642BFFD41D866DAD78C4AD5D6";
export const ENTERPRISE_CONTACT = "https://t.me/otabek_nabiyev1";

export type ReceiptAnalysis = { approved: boolean; amount: number; currency: string; confidence: number; reason: string };

function contentText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter(item => typeof item === "object" && item && "type" in item && item.type === "text").map(item => (item as { text?: string }).text ?? "").join("\n");
  return "";
}

export async function analyzeIndividualReceipt(input: { url: string; mimeType: string }): Promise<ReceiptAnalysis> {
  const visualPart = input.mimeType === "application/pdf"
    ? { type: "file_url" as const, file_url: { url: input.url, mime_type: "application/pdf" as const } }
    : { type: "image_url" as const, image_url: { url: input.url, detail: "high" as const } };
  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You verify Uzbek Click payment receipts for Acadium. Approve only when the receipt clearly shows a successful payment of exactly 99000 UZS (or 99,000 сум) to the intended Click payment recipient. Reject screenshots that are unreadable, edited, pending, refunded, wrong amount, wrong currency, or unrelated. Never infer missing facts." },
      { role: "user", content: [{ type: "text", text: "Analyze this receipt and return strict JSON. The result must be based only on visible receipt evidence." }, visualPart] },
    ],
    response_format: { type: "json_schema", json_schema: { name: "acadium_receipt_verification", strict: true, schema: { type: "object", properties: { approved: { type: "boolean" }, amount: { type: "integer" }, currency: { type: "string" }, confidence: { type: "integer", minimum: 0, maximum: 100 }, reason: { type: "string" } }, required: ["approved", "amount", "currency", "confidence", "reason"], additionalProperties: false } } },
    maxTokens: 300,
  });
  const raw = contentText(response.choices[0]?.message?.content);
  const parsed = JSON.parse(raw) as ReceiptAnalysis;
  const currency = parsed.currency.trim().toUpperCase();
  const approved = Boolean(parsed.approved) && parsed.amount === INDIVIDUAL_PRICE_UZS && ["UZS", "SUM", "СУМ"].includes(currency) && parsed.confidence >= 85;
  return { approved, amount: parsed.amount, currency, confidence: Math.max(0, Math.min(100, parsed.confidence)), reason: approved ? parsed.reason : `Receipt verification failed: ${parsed.reason}` };
}
