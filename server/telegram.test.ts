import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramInitData } from "./telegram";

const BOT_TOKEN = "123456:local-test-token";
const NOW = 1_800_000_000;

function signedInitData(values: Record<string, string>) {
  const params = new URLSearchParams(values);
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
  return params.toString();
}

describe("verifyTelegramInitData", () => {
  it("accepts a valid signed Telegram identity", () => {
    const initData = signedInitData({
      auth_date: String(NOW),
      query_id: "AAH-test",
      user: JSON.stringify({ id: 4001, first_name: "Aziza", username: "aziza_teacher" }),
    });

    expect(verifyTelegramInitData(initData, BOT_TOKEN, NOW)).toMatchObject({
      telegramId: "4001",
      chatId: "4001",
      firstName: "Aziza",
      username: "aziza_teacher",
    });
  });

  it("rejects a modified payload", () => {
    const initData = signedInitData({
      auth_date: String(NOW),
      user: JSON.stringify({ id: 4001, first_name: "Aziza" }),
    }).replace("Aziza", "Malika");

    expect(() => verifyTelegramInitData(initData, BOT_TOKEN, NOW)).toThrow("signature");
  });

  it("rejects an expired payload", () => {
    const initData = signedInitData({
      auth_date: String(NOW - 90_000),
      user: JSON.stringify({ id: 4001, first_name: "Aziza" }),
    });

    expect(() => verifyTelegramInitData(initData, BOT_TOKEN, NOW)).toThrow("expired");
  });
});
