import { describe, expect, it } from "vitest";

const token = process.env.TELEGRAM_BOT_TOKEN;

describe("Telegram bot credentials", () => {
  it("requires the Telegram bot token secret", () => {
    expect(token, "TELEGRAM_BOT_TOKEN must be configured").toBeTruthy();
  });

  it.skipIf(process.env.RUN_EXTERNAL_INTEGRATION_TESTS !== "true")("authenticates with Telegram getMe when external integration tests are enabled", async () => {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const body = await response.json() as { ok?: boolean; result?: { id?: number; is_bot?: boolean } };
    expect(body.ok).toBe(true);
    expect(body.result?.is_bot).toBe(true);
    expect(body.result?.id).toBeTypeOf("number");
  }, 15_000);
});
