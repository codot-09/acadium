import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ selectCalls: 0, insertCalls: 0 }));
const createdSubscription = { id: "subscription-1", profileId: 42, receiptId: "receipt-1", plan: "individual", status: "active", amount: 99000, currency: "UZS", startsAt: new Date(1), endsAt: new Date(2), createdAt: new Date(1) };

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => ({
  select: () => {
    state.selectCalls += 1;
    const chain = { from: () => chain, where: () => chain, orderBy: () => chain, limit: async () => state.selectCalls === 1 ? [] : [createdSubscription] };
    return chain;
  },
  insert: () => ({ values: async () => { state.insertCalls += 1; } }),
})) }));

import { activateIndividualSubscription } from "./db";

describe("subscription DB idempotency", () => {
  it("returns the existing subscription when the same receipt is activated twice", async () => {
    process.env.DATABASE_URL = "mysql://test";
    state.selectCalls = 0; state.insertCalls = 0;
    const first = await activateIndividualSubscription({ profileId: 42, receiptId: "receipt-1", amount: 99000, startsAt: new Date(1) });
    const second = await activateIndividualSubscription({ profileId: 42, receiptId: "receipt-1", amount: 99000, startsAt: new Date(1) });
    expect(first).toEqual(createdSubscription);
    expect(second).toEqual(createdSubscription);
    expect(state.insertCalls).toBe(1);
  });
});
