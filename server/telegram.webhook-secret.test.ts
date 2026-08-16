import { describe, expect, it } from "vitest";
import { verifyWebhookSecret } from "./telegramBot";

describe("Telegram webhook secret", () => {
  it("accepts the configured secret and rejects missing or incorrect headers", () => {
    const configured = process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(configured, "TELEGRAM_WEBHOOK_SECRET must be configured").toBeTruthy();
    expect(verifyWebhookSecret(configured, configured)).toBe(true);
    expect(verifyWebhookSecret(undefined, configured)).toBe(false);
    expect(verifyWebhookSecret("wrong-secret", configured)).toBe(false);
  });
});
