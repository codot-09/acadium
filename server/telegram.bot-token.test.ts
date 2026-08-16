import { describe, expect, it } from "vitest";

describe("Telegram bot credentials", () => {
  it("authenticates with Telegram getMe", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    expect(token, "TELEGRAM_BOT_TOKEN must be configured").toBeTruthy();

    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const body = await response.json() as { ok?: boolean; result?: { id?: number; is_bot?: boolean } };

    expect(body.ok).toBe(true);
    expect(body.result?.is_bot).toBe(true);
    expect(body.result?.id).toBeTypeOf("number");
  }, 15_000);
});
