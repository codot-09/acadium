// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./Admin";

const state = vi.hoisted(() => ({ authenticated: false, loginMutate: vi.fn(), logoutMutate: vi.fn(), roleMutate: vi.fn(), receiptMutate: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ admin: { me: { invalidate: vi.fn() }, overview: { invalidate: vi.fn() }, profiles: { invalidate: vi.fn() }, receipts: { invalidate: vi.fn() } } }),
  admin: {
    me: { useQuery: () => ({ data: { authenticated: state.authenticated }, isLoading: false, refetch: vi.fn() }) },
    login: { useMutation: (options: { onSuccess?: () => void }) => ({ mutate: (...args: unknown[]) => { state.loginMutate(...args); options.onSuccess?.(); }, isPending: false }) },
    logout: { useMutation: () => ({ mutate: state.logoutMutate, isPending: false }) },
    overview: { useQuery: () => ({ data: { profiles: 12, teachers: 4, students: 8, groups: 3, sessions: 18, activeSubscriptions: 2, pendingReceipts: 1, sources: 7 }, isFetching: false }) },
    profiles: { useQuery: () => ({ data: [{ id: 1, firstName: "Teacher", lastName: null, username: "teacher", telegramId: "7", role: "teacher", createdAt: new Date(1) }] }) },
    sessions: { useQuery: () => ({ data: [{ id: "s1", title: "Biology", topic: "biology", groupTitle: "Class", status: "live", startedAt: new Date(1) }] }) },
    receipts: { useQuery: () => ({ data: [{ id: "r1", fileName: "receipt.png", parsedAmount: 99000, parsedCurrency: "UZS", confidence: 96, status: "pending", createdAt: new Date(1) }] }) },
    subscriptions: { useQuery: () => ({ data: [{ id: "sub1", profileId: 1, receiptId: "r1", plan: "individual", amount: 99000, currency: "UZS", startsAt: new Date(1), endsAt: new Date(2), status: "active" }] }) },
    setProfileRole: { useMutation: () => ({ mutate: state.roleMutate, isPending: false }) },
    setReceiptStatus: { useMutation: () => ({ mutate: state.receiptMutate, isPending: false }) },
    setSubscriptionStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    setSessionStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
  },
} }));

describe("admin panel", () => {
  beforeEach(() => { state.authenticated = false; state.loginMutate.mockReset(); state.logoutMutate.mockReset(); });

  it("renders a password-protected login and submits credentials", async () => {
    render(<AdminPage />);
    expect(screen.getByRole("heading", { name: "Control the learning ecosystem" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Login"), { target: { value: "onabiyev626@gmail.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "otabek09" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter control room" }));
    await waitFor(() => expect(state.loginMutate).toHaveBeenCalledWith({ login: "onabiyev626@gmail.com", password: "otabek09" }));
  });

  it("shows platform KPIs and moderation tabs after admin authentication", () => {
    state.authenticated = true;
    render(<AdminPage />);
    expect(screen.getByRole("heading", { name: "Learning ecosystem control room" })).toBeTruthy();
    expect(screen.getByText("Pending receipt queue")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Receipts" }));
    expect(screen.getByText("receipt.png")).toBeTruthy();
    expect(screen.getByText("96%")).toBeTruthy();
  });
});
