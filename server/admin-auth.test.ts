import { describe, expect, it } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSession, getAdminCookie, verifyAdminCredentials, verifyAdminSession } from "./adminAuth";

describe("admin credential verification", () => {
  it("accepts the configured admin secret pair without exposing the password", () => {
    expect(verifyAdminCredentials("onabiyev626@gmail.com", "otabek09")).toBe(true);
    expect(verifyAdminCredentials("onabiyev626@gmail.com", "wrong-password")).toBe(false);
    expect(verifyAdminCredentials("other@example.com", "otabek09")).toBe(false);
  });

  it("signs a time-limited session and rejects tampering or expiry", () => {
    const now = 1_700_000_000_000;
    const token = createAdminSession(now);
    expect(verifyAdminSession(token, now + 60_000)).toBe(true);
    expect(verifyAdminSession(`${token}x`, now + 60_000)).toBe(false);
    expect(verifyAdminSession(token, now + 13 * 60 * 60 * 1000)).toBe(false);
    expect(getAdminCookie(`foo=bar; ${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`)).toBe(token);
  });
});
