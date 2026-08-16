import { describe, expect, it } from "vitest";
import { canRedeemTeacherInvite, canSelectTeacherRole } from "./teacherAccess";

describe("teacher promotion access", () => {
  it("rejects unauthorized self-promotion", () => {
    expect(canSelectTeacherRole("student")).toBe(false);
    expect(canSelectTeacherRole("teacher")).toBe(true);
  });

  it("accepts a valid unused invite", () => {
    const now = new Date("2026-08-16T00:00:00Z");
    expect(canRedeemTeacherInvite({ exists: true, usedAt: null, expiresAt: new Date("2026-08-20T00:00:00Z") }, now)).toBe(true);
  });

  it("rejects used and expired invites", () => {
    const now = new Date("2026-08-16T00:00:00Z");
    expect(canRedeemTeacherInvite({ exists: true, usedAt: new Date("2026-08-15T00:00:00Z"), expiresAt: new Date("2026-08-20T00:00:00Z") }, now)).toBe(false);
    expect(canRedeemTeacherInvite({ exists: true, usedAt: null, expiresAt: new Date("2026-08-15T00:00:00Z") }, now)).toBe(false);
  });
});
