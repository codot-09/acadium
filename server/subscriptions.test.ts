import { describe, expect, it, vi } from "vitest";

const llmMock = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/llm", () => llmMock);

import { analyzeIndividualReceipt, INDIVIDUAL_PRICE_UZS } from "./subscriptions";

describe("individual receipt verification", () => {
  it("approves an exact 99,000 UZS successful receipt with high confidence", async () => {
    llmMock.invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ approved: true, amount: 99000, currency: "UZS", confidence: 96, reason: "Successful Click payment is visible.", paymentStatus: "success", recipient: "Acadium Click", transactionId: "TX-99000", paidAt: "2026-08-17T08:00:00Z", evidence: ["Success status visible", "Amount 99,000 UZS visible"], fraudSignals: [] }) } }] });
    const result = await analyzeIndividualReceipt({ url: "https://storage.test/receipt.png", mimeType: "image/png" });
    expect(result).toMatchObject({ approved: true, amount: INDIVIDUAL_PRICE_UZS, currency: "UZS", confidence: 96, paymentStatus: "success", recipient: "Acadium Click", transactionId: "TX-99000", fraudSignals: [] });
    expect(llmMock.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({ response_format: expect.objectContaining({ type: "json_schema" }) }));
  });

  it("rejects a wrong amount even if the model claims the receipt is valid", async () => {
    llmMock.invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ approved: true, amount: 50000, currency: "UZS", confidence: 99, reason: "Payment is visible.", paymentStatus: "success", recipient: "Acadium Click", transactionId: "TX-WRONG", paidAt: "2026-08-17T08:00:00Z", evidence: ["Success status visible", "Wrong amount visible"], fraudSignals: [] }) } }] });
    const result = await analyzeIndividualReceipt({ url: "https://storage.test/receipt.pdf", mimeType: "application/pdf" });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("Receipt rejected or requires manual review");
  });
});
