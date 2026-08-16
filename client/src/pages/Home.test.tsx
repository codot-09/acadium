// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const calls = vi.hoisted(() => ({ sessionRefetch: vi.fn(), analyticsRefetch: vi.fn(), detailRefetch: vi.fn(), statusMutate: vi.fn(), statusOnSuccess: vi.fn(), sessionQueryOptions: {} as Record<string, unknown> }));
const state = vi.hoisted(() => ({
  loading: false,
  missing: false,
  sessions: [{ id: "session-1", title: "Fotosintez", groupTitle: "Biology class", status: "ended", createdAt: new Date() }],
  analytics: { sessions: 1, groupStudents: 1, groupAnswers: 1, activity: [], groupStudentBreakdown: [{ profileId: 11, name: "Student One", username: "studentone", attendance: 1, participation: 1, answers: 1, averageConfidence: 88, needsTeacher: false, lastClassification: "answer", lastActivity: new Date() }], sessionAnalytics: [{ sessionId: "session-1", title: "Fotosintez", groupTitle: "Biology class", status: "ended", attendance: 1, responses: 1, participation: 1, lastActivity: new Date() }] },
  detail: { session: { id: "session-1", title: "Fotosintez", groupTitle: "Biology class", topic: "fotosintez", status: "ended" }, participants: [{ participant: { profileId: 11 }, profile: { firstName: "Student", lastName: "One", username: "studentone" } }], events: [{ event: { id: 1, eventType: "answer", content: "Fotosintez bargda bo‘ladi", createdAt: new Date(), analysisJson: JSON.stringify({ classification: "answer", confidence: 0.88 }) }, profile: { firstName: "Student", lastName: "One", username: "studentone" } }] },
  detail2: { session: { id: "session-2", title: "Hujayra tuzilishi", groupTitle: "Biology class", topic: "hujayra", status: "ended" }, participants: [], events: [] },
}));

vi.mock("@/lib/trpc", () => ({ trpc: {
  telegram: {
    bootstrap: { useMutation: () => ({ mutate: vi.fn(), data: { firstName: "Teacher" } }) },
    analytics: { useQuery: () => ({ data: state.analytics, isFetching: false, refetch: calls.analyticsRefetch }) },
  },
  teacher: { sessions: { useQuery: (_input: unknown, options: Record<string, unknown>) => { Object.assign(calls.sessionQueryOptions, options); return { data: state.sessions, isFetching: false, refetch: calls.sessionRefetch }; } }, sessionDetail: { useQuery: (input: { sessionId: string }) => ({ data: state.loading || state.missing ? undefined : input.sessionId === "session-2" ? state.detail2 : state.detail, isLoading: state.loading, refetch: calls.detailRefetch }) }, updateSessionStatus: { useMutation: (options: { onSuccess?: () => unknown }) => { calls.statusOnSuccess = vi.fn(options.onSuccess); return { mutate: calls.statusMutate, isPending: false }; } } },
} }));

describe("group-first teacher workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.loading = false;
    state.missing = false;
    state.sessions = [{ id: "session-1", title: "Fotosintez", groupTitle: "Biology class", status: "ended", createdAt: new Date() }];
    calls.sessionQueryOptions = {};
    (window as Window & { Telegram?: unknown }).Telegram = { WebApp: { initData: "telegram-init-data", ready: vi.fn(), expand: vi.fn() } };
  });

  it("selects a saved lesson and shows its conversation timeline", async () => {
    render(<Home />);
    await waitFor(() => expect(screen.getAllByText("Lesson sessions").length).toBeGreaterThan(0));
    expect(screen.getByText("Recent sessions")).toBeInTheDocument();
    const sessionButton = screen.getAllByRole("button").find(button => button.textContent?.includes("Fotosintez"));
    expect(sessionButton).toBeDefined();
    fireEvent.click(sessionButton!);
    expect(await screen.findByText("SESSION CONVERSATION")).toBeInTheDocument();
    expect(screen.getByText(/Student answer/)).toBeInTheDocument();
    expect(screen.getByText("Fotosintez bargda bo‘ladi")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Student analytics/i }));
    expect(screen.getByText("Student signals")).toBeInTheDocument();
  });

  it("switches session detail when a second saved lesson is selected", async () => {
    state.sessions = [{ id: "session-1", title: "Fotosintez", groupTitle: "Biology class", status: "ended", createdAt: new Date() }, { id: "session-2", title: "Hujayra tuzilishi", groupTitle: "Biology class", status: "ended", createdAt: new Date() }];
    state.analytics = { ...state.analytics, sessions: 2, sessionAnalytics: [...state.analytics.sessionAnalytics, { sessionId: "session-2", title: "Hujayra tuzilishi", groupTitle: "Biology class", status: "ended", attendance: 0, responses: 0, participation: 0, lastActivity: new Date() }] };
    render(<Home />);
    await waitFor(() => expect(screen.getByText("Recent sessions")).toBeInTheDocument());
    const secondButton = screen.getAllByRole("button").find(button => button.textContent?.includes("Hujayra tuzilishi"));
    expect(secondButton).toBeDefined();
    fireEvent.click(secondButton!);
    await waitFor(() => expect(screen.getAllByText("Hujayra tuzilishi").length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText(/No conversation events recorded/)).toBeInTheDocument();
  });

  it("uses the authoritative teacher session query even when analytics history is empty", async () => {
    state.sessions = [{ id: "session-2", title: "Hujayra tuzilishi", groupTitle: "Biology class", status: "live", createdAt: new Date() }];
    state.analytics = { ...state.analytics, sessionAnalytics: [] };
    render(<Home />);
    await waitFor(() => expect(screen.getAllByText("Hujayra tuzilishi").length).toBeGreaterThan(0));
    expect(screen.queryByText(/No Telegram lessons have been recorded yet/)).not.toBeInTheDocument();
  });

  it("refetches live session data after five seconds", async () => {
    vi.useFakeTimers();
    try {
      render(<Home />);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); vi.advanceTimersByTime(5000); });
      expect(calls.sessionRefetch).toHaveBeenCalled();
      expect(calls.analyticsRefetch).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes sessions and sends Web App status controls through the mutation", async () => {
    state.analytics = { ...state.analytics, sessions: 1, sessionAnalytics: [{ sessionId: "session-1", title: "Fotosintez", groupTitle: "Biology class", status: "live", attendance: 1, responses: 1, participation: 1, lastActivity: new Date() }] };
    state.detail = { ...state.detail, session: { ...state.detail.session, status: "live" } };
    render(<Home />);
    await waitFor(() => expect(screen.getAllByText("Recent sessions").length).toBeGreaterThan(0));
    const refreshButton = screen.getAllByRole("button").find(button => button.textContent?.includes("Refresh"));
    expect(refreshButton).toBeDefined();
    fireEvent.click(refreshButton!);
    expect(calls.sessionRefetch).toHaveBeenCalled();
    expect(calls.analyticsRefetch).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(calls.statusMutate).toHaveBeenCalledWith({ initData: "telegram-init-data", sessionId: "session-1", status: "paused" });
  });

  it("sends Resume and End status payloads and refetches after mutation success", async () => {
    state.detail = { ...state.detail, session: { ...state.detail.session, status: "paused" } };
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(calls.statusMutate).toHaveBeenCalledWith({ initData: "telegram-init-data", sessionId: "session-1", status: "live" });
    await calls.statusOnSuccess();
    expect(calls.sessionRefetch).toHaveBeenCalled();
    expect(calls.analyticsRefetch).toHaveBeenCalled();
    expect(calls.detailRefetch).toHaveBeenCalled();
    calls.statusMutate.mockClear();
    state.detail = { ...state.detail, session: { ...state.detail.session, status: "live" } };
    render(<Home />);
    const endButton = screen.getAllByRole("button").find(button => button.textContent?.includes("End session"));
    expect(endButton).toBeDefined();
    fireEvent.click(endButton!);
    expect(calls.statusMutate).toHaveBeenCalledWith({ initData: "telegram-init-data", sessionId: "session-1", status: "ended" });
  });

  it("shows an explicit loading state while session details are fetched", async () => {
    state.loading = true;
    render(<Home />);
    await waitFor(() => expect(screen.getByText("Loading session conversation")).toBeInTheDocument());
    expect(screen.getByText(/Fetching students, replies and AI analysis/)).toBeInTheDocument();
    state.loading = false;
  });

  it("shows a placeholder when a selected session has no detail data", async () => {
    state.missing = true;
    render(<Home />);
    await waitFor(() => expect(screen.getByText("Select a lesson session")).toBeInTheDocument());
    expect(screen.getByText(/Choose a saved Telegram lesson/)).toBeInTheDocument();
  });

  it("shows a useful empty state when no group sessions exist", async () => {
    state.sessions = [];
    state.analytics = { ...state.analytics, sessions: 0, sessionAnalytics: [], groupStudents: 0, groupAnswers: 0, groupStudentBreakdown: [] };
    render(<Home />);
    await waitFor(() => expect(screen.getByText(/No Telegram lessons have been recorded yet/i)).toBeInTheDocument());
    expect(screen.getByText(/\/lesson topic/)).toBeInTheDocument();
  });
});
