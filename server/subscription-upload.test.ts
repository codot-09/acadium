import { describe, expect, it, vi } from "vitest";
import { createSubscriptionReceiptUploadHandler } from "./subscriptionUpload";

function responseMock() {
  const response = { statusCode: 200, body: undefined as unknown, status(code: number) { response.statusCode = code; return response; }, json(body: unknown) { response.body = body; return response; } };
  return response;
}

const baseRequest = { body: { initData: "signed-init-data", fileName: "click-receipt.png", mimeType: "image/png", dataBase64: Buffer.from("receipt").toString("base64") } } as never;

function depsFor(role = "teacher") {
  return {
    verify: vi.fn(() => ({ user: { id: 7, first_name: "Teacher" }, authDate: 1, hash: "hash" })) as never,
    upsertProfile: vi.fn(async () => ({ id: 42, role })) as never,
    put: vi.fn(async () => ({ key: "subscription-receipts/42/receipt.png", url: "https://storage.test/receipt.png" })) as never,
    createReceipt: vi.fn(async (input: unknown) => ({ ...(input as object), status: "pending" })) as never,
    analyze: vi.fn(async () => ({ approved: true, amount: 99000, currency: "UZS", confidence: 97, reason: "Click success visible", paymentStatus: "success", recipient: "Acadium Click", transactionId: "TX-1", paidAt: "2026-08-17T08:00:00Z", evidence: ["Success", "99,000 UZS"], fraudSignals: [], analysisVersion: "click-v2" })) as never,
    updateReceipt: vi.fn(async (input: unknown) => ({ ...(input as object), status: "approved" })) as never,
    activate: vi.fn(async () => ({ id: "subscription-1", status: "active" })) as never,
  };
}

describe("subscription receipt upload handler", () => {
  it("rejects unsupported receipt formats before verification", async () => {
    const deps = depsFor();
    const res = responseMock();
    await createSubscriptionReceiptUploadHandler(deps)({ body: { ...baseRequest.body, mimeType: "text/plain" } } as never, res as never);
    expect(res.statusCode).toBe(415);
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it("rejects non-teacher Telegram profiles", async () => {
    const deps = depsFor("student");
    const res = responseMock();
    await createSubscriptionReceiptUploadHandler(deps)(baseRequest, res as never);
    expect(res.statusCode).toBe(403);
  });

  it("rejects an already submitted receipt fingerprint before AI analysis", async () => {
    const deps = depsFor();
    deps.createReceipt.mockRejectedValueOnce(new Error("Duplicate fingerprint"));
    const res = responseMock();
    await createSubscriptionReceiptUploadHandler(deps)(baseRequest, res as never);
    expect(res.statusCode).toBe(409);
    expect(deps.analyze).not.toHaveBeenCalled();
    expect(deps.activate).not.toHaveBeenCalled();
  });

  it("activates a one-month individual plan after approved AI verification", async () => {
    const deps = depsFor();
    const res = responseMock();
    await createSubscriptionReceiptUploadHandler(deps)(baseRequest, res as never);
    expect(res.statusCode).toBe(201);
    expect(deps.analyze).toHaveBeenCalledWith({ url: "https://storage.test/receipt.png", mimeType: "image/png" });
    expect(deps.createReceipt).toHaveBeenCalledWith(expect.objectContaining({ fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(deps.updateReceipt).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String), status: "approved", parsedAmount: 99000 }));
    expect(deps.activate).toHaveBeenCalledWith(expect.objectContaining({ profileId: 42, amount: 99000 }));
    expect((res.body as { approved: boolean }).approved).toBe(true);
  });

  it("queues uncertain AI results for admin review without activating a subscription", async () => {
    const deps = depsFor();
    deps.analyze.mockResolvedValueOnce({ approved: false, amount: 99000, currency: "UZS", confidence: 72, reason: "Transaction ID is not visible", paymentStatus: "unknown", recipient: "", transactionId: "", paidAt: "", evidence: ["Amount visible"], fraudSignals: ["Missing transaction ID"], analysisVersion: "click-v2" } as never);
    const res = responseMock();
    await createSubscriptionReceiptUploadHandler(deps)(baseRequest, res as never);
    expect(res.statusCode).toBe(201);
    expect(deps.updateReceipt).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", paymentStatus: "unknown", fraudSignals: ["Missing transaction ID"], analysisVersion: "click-v2" }));
    expect(deps.activate).not.toHaveBeenCalled();
    expect((res.body as { reviewRequired: boolean }).reviewRequired).toBe(true);
  });
});
