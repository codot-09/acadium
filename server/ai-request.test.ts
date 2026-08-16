import { describe, expect, it } from "vitest";
import { getTelegramInitData } from "./aiRequest";

describe("AI request Telegram identity selection", () => {
  it("does not enter Telegram verification for preview-mode empty initData", () => {
    expect(getTelegramInitData("", "configured-bot-token")).toBeNull();
    expect(getTelegramInitData("   ", "configured-bot-token")).toBeNull();
    expect(getTelegramInitData(undefined, "configured-bot-token")).toBeNull();
  });

  it("preserves non-empty initData when the bot token is configured", () => {
    expect(getTelegramInitData("  query_id=abc  ", " configured-bot-token ")).toBe("query_id=abc");
  });

  it("does not trust initData when the bot token is absent", () => {
    expect(getTelegramInitData("query_id=abc", "")).toBeNull();
    expect(getTelegramInitData("query_id=abc", undefined)).toBeNull();
  });
});
