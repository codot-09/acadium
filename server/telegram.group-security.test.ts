import { describe, expect, it, vi } from "vitest";
import { groupEventKey, isGroupAdminMember, processTelegramUpdateOnce } from "./telegramBot";

describe("Telegram group security helpers", () => {
  it("requires an administrator or creator with posting access", () => {
    expect(isGroupAdminMember("administrator", true)).toBe(true);
    expect(isGroupAdminMember("creator")).toBe(true);
    expect(isGroupAdminMember("member", true)).toBe(false);
    expect(isGroupAdminMember("administrator", false)).toBe(false);
  });

  it("skips duplicate webhook updates before handler execution", async () => {
    const claim = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const handler = vi.fn().mockResolvedValue(undefined);
    expect(await processTelegramUpdateOnce(42, claim, handler)).toBe(true);
    expect(await processTelegramUpdateOnce(42, claim, handler)).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("creates stable event keys for webhook retries", () => {
    expect(groupEventKey(42, "message")).toBe("update:42:message");
    expect(groupEventKey(42, "message")).toBe(groupEventKey(42, "message"));
    expect(groupEventKey(undefined, "message")).toBe("update:unknown:message");
  });
});
