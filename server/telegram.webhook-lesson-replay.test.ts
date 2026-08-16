import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";

const aiMocks = vi.hoisted(() => ({
  generateGroupLessonBrief: vi.fn(),
  analyzeGroupMessage: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({
  createGroupSession: vi.fn(),
  ensureSessionParticipant: vi.fn(),
  ensureTeacherStudentLink: vi.fn(),
  getActiveGroupSession: vi.fn(),
  getGroupSessionSummary: vi.fn(),
  recordGroupSessionEvent: vi.fn(),
  updateGroupSessionStatus: vi.fn(),
  upsertTelegramGroupMember: vi.fn(),
  upsertTelegramProfile: vi.fn(),
  consumeTelegramGroupAnalysisRateLimit: vi.fn(),
}));

vi.mock("./ai", () => aiMocks);
vi.mock("./db", () => dbMocks);

import { handleTelegramUpdate } from "./telegramBot";
import { createTelegramWebhookApp } from "./telegramWebhookRoute";

describe("production-parity /lesson webhook replay", () => {
  it("passes a signed Telegram update through handler to session, events, and Telegram intro", async () => {
    vi.clearAllMocks();
    aiMocks.generateGroupLessonBrief.mockResolvedValue({ title: "Fotosintez", overview: "Safe lesson", objectives: ["Understand"], keyPoints: ["Light"], resources: [{ title: "Textbook", summary: "Trusted source", searchQuery: "fotosintez 8 sinf" }], firstQuestion: "Fotosintez nima?" });
    dbMocks.upsertTelegramProfile.mockResolvedValue({ id: 10 });
    dbMocks.getActiveGroupSession.mockResolvedValue(undefined);
    dbMocks.createGroupSession.mockResolvedValue({ id: "session-replay", topic: "fotosintez-8-sinf" });
    dbMocks.ensureSessionParticipant.mockResolvedValue(true);
    dbMocks.recordGroupSessionEvent.mockResolvedValue(true);
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("http://127.0.0.1")) return originalFetch(url, init);
      if (url.includes("getMe")) return new Response(JSON.stringify({ ok: true, result: { id: 999 } }), { status: 200 });
      if (url.includes("getChatMember")) return new Response(JSON.stringify({ ok: true, result: { status: "administrator", can_post_messages: true } }), { status: 200 });
      expect(init?.body).toBeTruthy();
      return new Response(JSON.stringify({ ok: true, result: { message_id: 700 } }), { status: 200 });
    }));

    const claim = vi.fn().mockResolvedValue(true);
    const server = createServer(createTelegramWebhookApp({ expectedSecret: "secret", claim, handle: body => handleTelegramUpdate(body as Parameters<typeof handleTelegramUpdate>[0]) }));
    await new Promise<void>(resolve => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/telegram/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "secret" }, body: JSON.stringify({ update_id: 9001, message: { chat: { id: -100, type: "supergroup", title: "Biology class" }, from: { id: 7, first_name: "Teacher" }, text: "/lesson fotosintez-8-sinf" } }) });

    expect(response.status).toBe(200);
    expect(claim).toHaveBeenCalledWith(9001);
    expect(dbMocks.createGroupSession).toHaveBeenCalledWith(expect.objectContaining({ topic: "fotosintez-8-sinf", telegramGroupId: "-100" }));
    expect(dbMocks.recordGroupSessionEvent).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "session-replay", eventType: "system" }));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("sendMessage"), expect.any(Object));
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
});
