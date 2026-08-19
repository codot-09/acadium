import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ selectCalls: 0, insertCalls: 0, customMode: false }));
const createdSubscription = { id: "subscription-1", profileId: 42, receiptId: "receipt-1", plan: "individual", status: "active", amount: 99000, currency: "UZS", startsAt: new Date(1), endsAt: new Date(2), createdAt: new Date(1) };

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => ({
  select: () => {
    state.selectCalls += 1;
    const chain = { from: () => chain, where: () => chain, orderBy: () => chain, limit: async () => { if (state.customMode) { if (state.selectCalls === 1) return [{ id: 42 }]; if (state.selectCalls === 2) return []; return [createdSubscription]; } return state.selectCalls === 1 ? [] : [createdSubscription]; } };
    return chain;
  },
  insert: () => ({ values: async () => { state.insertCalls += 1; } }),
})) }));

import { activateIndividualSubscription, adminActivateCustomSubscription } from "./db";

describe("subscription DB idempotency", () => {
  it("returns the existing subscription when the same receipt is activated twice", async () => {
    process.env.DATABASE_URL = "mysql://test";
    state.selectCalls = 0; state.insertCalls = 0; state.customMode = false;
    const first = await activateIndividualSubscription({ profileId: 42, receiptId: "receipt-1", amount: 99000, startsAt: new Date(1) });
    const second = await activateIndividualSubscription({ profileId: 42, receiptId: "receipt-1", amount: 99000, startsAt: new Date(1) });
    expect(first).toEqual(createdSubscription);
    expect(second).toEqual(createdSubscription);
    expect(state.insertCalls).toBe(1);
  });

  it("does not create a duplicate when an admin activates an already active custom subscription", async () => {
    process.env.DATABASE_URL = "mysql://test";
    state.selectCalls = 0; state.insertCalls = 0; state.customMode = true;
    const first = await adminActivateCustomSubscription({ profileId: 42, plan: "enterprise", amount: 0, currency: "UZS", durationDays: 31 });
    const second = await adminActivateCustomSubscription({ profileId: 42, plan: "enterprise", amount: 0, currency: "UZS", durationDays: 31 });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(state.insertCalls).toBe(1);
  });
});
