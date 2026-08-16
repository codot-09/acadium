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
  it("persists distinct student reply senders as separate roster participants", async () => {
    vi.clearAllMocks();
    const originalFetch = globalThis.fetch;
    const replyCalls: Array<{ telegramId: string; profileId: number; groupId: string }> = [];
    dbMocks.upsertTelegramProfile.mockImplementation(async (identity: { telegramId: string }) => ({ id: identity.telegramId === "8" ? 11 : 12 }));
    dbMocks.getActiveGroupSession.mockResolvedValue({ id: "session-reply", teacherProfileId: 10, topic: "biology", lessonBriefJson: JSON.stringify({ title: "Biology", overview: "Overview", objectives: [], keyPoints: [], resources: [], firstQuestion: "Question" }) });
    dbMocks.upsertTelegramGroupMember.mockImplementation(async (input: { telegramGroupId: string; profileId: number }) => { replyCalls.push({ telegramId: input.profileId === 11 ? "8" : "9", profileId: input.profileId, groupId: input.telegramGroupId }); });
    aiMocks.analyzeGroupMessage.mockResolvedValue({ classification: "answer", reply: "Good answer", confidence: 0.88, needsTeacher: false, suggestedNextStep: "Continue" });
    dbMocks.consumeTelegramGroupAnalysisRateLimit.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("http://127.0.0.1")) return originalFetch(url, init);
      if (url.includes("getMe")) return new Response(JSON.stringify({ ok: true, result: { id: 999 } }), { status: 200 });
      if (url.includes("getChatMember")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as { user_id?: number };
        const isAdmin = payload.user_id === 7 || payload.user_id === 999;
        return new Response(JSON.stringify({ ok: true, result: { status: isAdmin ? "administrator" : "member", can_post_messages: isAdmin } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 701 } }), { status: 200 });
    }));
    const claim = vi.fn(async (updateId: number) => true);
    const server = createServer(createTelegramWebhookApp({ expectedSecret: "secret", claim, handle: body => handleTelegramUpdate(body as Parameters<typeof handleTelegramUpdate>[0]) }));
    await new Promise<void>(resolve => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    const send = (update: unknown) => fetch(`http://127.0.0.1:${address.port}/api/telegram/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "secret" }, body: JSON.stringify(update) });
    const first = await send({ update_id: 9101, message: { message_id: 41, chat: { id: -100, type: "supergroup", title: "Biology class" }, from: { id: 8, first_name: "Student One" }, text: "Fotosintez bargda bo‘ladi", reply_to_message: { message_id: 33, text: "Fotosintez nima?" } } });
    const second = await send({ update_id: 9102, message: { message_id: 42, chat: { id: -100, type: "supergroup", title: "Biology class" }, from: { id: 9, first_name: "Student Two" }, text: "Xlorofill kerak bo‘ladi", reply_to_message: { message_id: 33, text: "Fotosintez nima?" } } });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(dbMocks.ensureSessionParticipant).toHaveBeenCalledWith("session-reply", 11);
    expect(dbMocks.ensureSessionParticipant).toHaveBeenCalledWith("session-reply", 12);
    expect(dbMocks.ensureTeacherStudentLink).toHaveBeenCalledWith(10, 11);
    expect(dbMocks.ensureTeacherStudentLink).toHaveBeenCalledWith(10, 12);
    expect(replyCalls).toEqual(expect.arrayContaining([{ telegramId: "8", profileId: 11, groupId: "-100" }, { telegramId: "9", profileId: 12, groupId: "-100" }]));
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

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
