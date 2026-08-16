import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createTelegramWebhookApp } from "./telegramWebhookRoute";

describe("Telegram webhook Express route", () => {
  it("returns 200 for retries and handles the same update only once", async () => {
    const seen = new Set<number>();
    const claim = vi.fn(async (updateId: number) => {
      if (seen.has(updateId)) return false;
      seen.add(updateId);
      return true;
    });
    const handle = vi.fn(async () => undefined);
    const server = createServer(createTelegramWebhookApp({ expectedSecret: "secret", claim, handle }));
    await new Promise<void>(resolve => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    const url = `http://127.0.0.1:${address.port}/api/telegram/webhook`;
    const request = { update_id: 501, message: { text: "/lesson biology" } };
    const first = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "secret" }, body: JSON.stringify(request) });
    const second = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "secret" }, body: JSON.stringify(request) });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenCalledTimes(1);
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
});
