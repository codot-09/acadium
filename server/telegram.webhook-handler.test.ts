import { describe, expect, it, vi } from "vitest";
import { processTelegramWebhookRequest } from "./telegramWebhook";

describe("Telegram webhook request handler", () => {
  it("acknowledges a repeated update without reprocessing it", async () => {
    const seen = new Set<number>();
    const claim = vi.fn(async (updateId: number) => {
      if (seen.has(updateId)) return false;
      seen.add(updateId);
      return true;
    });
    const handle = vi.fn(async () => undefined);
    const input = { suppliedSecret: "secret", expectedSecret: "secret", updateId: 77, body: { update_id: 77 }, claim, handle };
    expect(await processTelegramWebhookRequest(input)).toBe(200);
    expect(await processTelegramWebhookRequest(input)).toBe(200);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("rejects requests with an invalid secret", async () => {
    const handle = vi.fn(async () => undefined);
    const status = await processTelegramWebhookRequest({ suppliedSecret: "bad", expectedSecret: "secret", updateId: 78, body: {}, claim: async () => true, handle });
    expect(status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });
});
