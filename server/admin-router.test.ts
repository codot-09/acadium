import { describe, expect, it, vi } from "vitest";
import { createAdminSession } from "./adminAuth";

const dbMocks = vi.hoisted(() => ({
  getAdminOverview: vi.fn(async () => ({ profiles: 1, teachers: 1, students: 0, groups: 1, sessions: 2, activeSubscriptions: 1, pendingReceipts: 0, sources: 2 })),
  getAdminProfiles: vi.fn(async () => []),
  getAdminSessions: vi.fn(async () => []),
  getAdminReceipts: vi.fn(async () => []),
  getAdminSubscriptions: vi.fn(async () => []),
  adminSetTelegramProfileRole: vi.fn(async (profileId: number, role: string) => ({ id: profileId, role })),
  adminSetReceiptStatus: vi.fn(async () => ({ id: "receipt-1", profileId: 4, parsedAmount: 99000 })),
  adminSetSubscriptionStatus: vi.fn(async () => ({ id: "subscription-1", status: "cancelled" })),
  adminSetSessionStatus: vi.fn(async () => ({ id: "session-1", status: "paused" })),
  activateIndividualSubscription: vi.fn(async () => ({ id: "subscription-1" })),
  adminActivateCustomSubscription: vi.fn(async (input: { profileId: number; plan: string; amount: number; currency: string; durationDays: number }) => ({ created: true, subscription: { id: "custom-1", ...input } })),
}));
vi.mock("./db", () => dbMocks);

import { appRouter } from "./routers";

function context(cookie?: string) {
  return { req: { headers: cookie ? { cookie } : {} }, res: { cookie: vi.fn(), clearCookie: vi.fn() }, user: null } as never;
}

describe("admin tRPC authorization", () => {
  it("rejects analytics without an admin cookie", async () => {
    await expect(appRouter.createCaller(context()).admin.overview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(dbMocks.getAdminOverview).not.toHaveBeenCalled();
  });

  it("rejects custom activation without an admin cookie and validates the input contract", async () => {
    await expect(appRouter.createCaller(context()).admin.activateCustomSubscription({ profileId: 4, plan: "individual", amount: 99000, currency: "UZS", durationDays: 31 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const caller = appRouter.createCaller(context(`acadium_admin_session=${createAdminSession()}`));
    await expect(caller.admin.activateCustomSubscription({ profileId: 4, plan: "individual", amount: 99000, currency: "uzs", durationDays: 31 })).resolves.toMatchObject({ created: true });
    expect(dbMocks.adminActivateCustomSubscription).toHaveBeenCalledWith({ profileId: 4, plan: "individual", amount: 99000, currency: "UZS", durationDays: 31 });
    await expect(caller.admin.activateCustomSubscription({ profileId: 4, plan: "individual", amount: -1, currency: "UZS", durationDays: 31 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows valid admin sessions and protects moderation mutations", async () => {
    const caller = appRouter.createCaller(context(`acadium_admin_session=${createAdminSession()}`));
    await expect(caller.admin.overview()).resolves.toMatchObject({ teachers: 1 });
    await expect(caller.admin.setProfileRole({ profileId: 4, role: "teacher" })).resolves.toMatchObject({ id: 4, role: "teacher" });
    await expect(caller.admin.setSessionStatus({ sessionId: "session-1", status: "paused" })).resolves.toMatchObject({ status: "paused" });
    await expect(caller.admin.setReceiptStatus({ receiptId: "receipt-1", status: "approved" })).resolves.toMatchObject({ id: "receipt-1" });
    expect(dbMocks.adminSetTelegramProfileRole).toHaveBeenCalledWith(4, "teacher");
    expect(dbMocks.adminSetSessionStatus).toHaveBeenCalledWith("session-1", "paused");
    expect(dbMocks.activateIndividualSubscription).toHaveBeenCalledWith({ profileId: 4, receiptId: "receipt-1", amount: 99000 });
    dbMocks.activateIndividualSubscription.mockClear();
    await expect(caller.admin.setReceiptStatus({ receiptId: "receipt-1", status: "rejected" })).resolves.toMatchObject({ id: "receipt-1" });
    expect(dbMocks.activateIndividualSubscription).not.toHaveBeenCalled();
  });
});
