import { beforeEach, describe, expect, it, vi } from "vitest";

const aiMocks = vi.hoisted(() => ({
  analyzeGroupMessage: vi.fn(),
  generateGroupLessonBrief: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  createGroupSession: vi.fn(),
  ensureSessionParticipant: vi.fn(),
  ensureTeacherStudentLink: vi.fn(),
  getActiveGroupSession: vi.fn(),
  recordGroupSessionEvent: vi.fn(),
  updateGroupSessionStatus: vi.fn(),
  upsertTelegramGroupMember: vi.fn(),
  upsertTelegramProfile: vi.fn(),
  getGroupSessionSummary: vi.fn(),
  consumeTelegramGroupAnalysisRateLimit: vi.fn(),
}));

vi.mock("./ai", () => aiMocks);
vi.mock("./db", () => dbMocks);

import { handleTelegramUpdate } from "./telegramBot";

describe("Telegram group lesson handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiMocks.generateGroupLessonBrief.mockResolvedValue({ title: "Biology", overview: "Overview", objectives: ["Understand"], keyPoints: ["Key point"], resources: [{ title: "Reading", summary: "Short reading", searchQuery: "photosynthesis" }], firstQuestion: "What is it?" });
    aiMocks.analyzeGroupMessage.mockResolvedValue({ classification: "answer", reply: "Good answer", confidence: 0.9, needsTeacher: false, suggestedNextStep: "Try an example" });
    dbMocks.upsertTelegramProfile.mockResolvedValue({ id: 10 });
    dbMocks.getActiveGroupSession.mockResolvedValue(undefined);
    dbMocks.createGroupSession.mockResolvedValue({ id: "session-1", topic: "biology" });
    dbMocks.recordGroupSessionEvent.mockResolvedValue(true);
    dbMocks.getGroupSessionSummary.mockResolvedValue({ attendance: 2, responses: 1, questions: 1, analyzed: 1 });
    dbMocks.consumeTelegramGroupAnalysisRateLimit.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("getMe")) return new Response(JSON.stringify({ ok: true, result: { id: 999 } }), { status: 200 });
      if (url.includes("getChatMember")) { const payload = JSON.parse(String(init?.body ?? "{}")) as { user_id?: number }; const isAdmin = payload.user_id === 7 || payload.user_id === 999; return new Response(JSON.stringify({ ok: true, result: { status: isAdmin ? "administrator" : "member", can_post_messages: isAdmin } }), { status: 200 }); }
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    }));
  });

  it("starts a lesson when teacher and bot are admins", async () => {
    await handleTelegramUpdate({ update_id: 101, message: { chat: { id: -100, type: "supergroup", title: "Class" }, from: { id: 7, first_name: "Teacher" }, text: "/lesson biology" } });
    expect(dbMocks.createGroupSession).toHaveBeenCalledWith(expect.objectContaining({ teacherProfileId: 10, telegramGroupId: "-100", topic: "biology" }));
    expect(dbMocks.recordGroupSessionEvent).toHaveBeenCalled();
  });

  it("rejects a non-admin teacher command", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("sendMessage") ? new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }) : new Response(JSON.stringify({ ok: true, result: { status: "member" } }), { status: 200 })));
    await handleTelegramUpdate({ update_id: 102, message: { chat: { id: -100, type: "group", title: "Class" }, from: { id: 7, first_name: "Student" }, text: "/lesson biology" } });
    expect(dbMocks.createGroupSession).not.toHaveBeenCalled();
  });

  it("registers a new member during an active lesson", async () => {
    dbMocks.getActiveGroupSession.mockResolvedValue({ id: "session-1", teacherProfileId: 10 });
    await handleTelegramUpdate({ update_id: 103, chat_member: { chat: { id: -100, type: "supergroup", title: "Class" }, new_chat_member: { status: "member", user: { id: 8, first_name: "Student" } } } });
    expect(dbMocks.upsertTelegramGroupMember).toHaveBeenCalledWith(expect.objectContaining({ telegramGroupId: "-100", profileId: 10, status: "member" }));
    expect(dbMocks.ensureSessionParticipant).toHaveBeenCalledWith("session-1", 10);
  });

  it("analyzes a student answer and replies to the source message", async () => {
    dbMocks.getActiveGroupSession.mockResolvedValue({ id: "session-1", teacherProfileId: 10, topic: "biology", lessonBriefJson: JSON.stringify({ title: "Biology", overview: "Overview", objectives: [], keyPoints: [], resources: [], firstQuestion: "Question" }) });
    await handleTelegramUpdate({ update_id: 107, message: { message_id: 45, chat: { id: -100, type: "group", title: "Class" }, from: { id: 8, first_name: "Student" }, text: "Fotosintez bargda bo‘ladi" } });
    expect(aiMocks.analyzeGroupMessage).toHaveBeenCalledWith("biology", expect.any(Object), "Fotosintez bargda bo‘ladi");
    expect(dbMocks.recordGroupSessionEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "answer", analysisJson: expect.stringContaining("Good answer"), replyToMessageId: "45" }));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("sendMessage"), expect.objectContaining({ body: expect.stringContaining("reply_parameters") }));
  });

  it("skips AI and sends a fallback reply when the persistent rate limit is exceeded", async () => {
    dbMocks.getActiveGroupSession.mockResolvedValue({ id: "session-1", teacherProfileId: 10, topic: "biology", lessonBriefJson: "{}" });
    dbMocks.consumeTelegramGroupAnalysisRateLimit.mockResolvedValue(false);
    await handleTelegramUpdate({ update_id: 108, message: { message_id: 46, chat: { id: -100, type: "group", title: "Class" }, from: { id: 8, first_name: "Student" }, text: "Another answer" } });
    expect(dbMocks.consumeTelegramGroupAnalysisRateLimit).toHaveBeenCalledWith("group:-100:profile:10", 8, 60_000);
    expect(aiMocks.analyzeGroupMessage).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("sendMessage"), expect.objectContaining({ body: expect.stringContaining("juda ko‘p") }));
  });

  it("records a teacher question with /ask", async () => {
    dbMocks.getActiveGroupSession.mockResolvedValue({ id: "session-1", teacherProfileId: 10 });
    await handleTelegramUpdate({ update_id: 105, message: { chat: { id: -100, type: "group", title: "Class" }, from: { id: 7, first_name: "Teacher" }, text: "/ask Explain photosynthesis" } });
    expect(dbMocks.recordGroupSessionEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "question", content: "Explain photosynthesis" }));
  });

  it("ends an active lesson with /endlesson", async () => {
    dbMocks.getActiveGroupSession.mockResolvedValue({ id: "session-1", teacherProfileId: 10 });
    await handleTelegramUpdate({ update_id: 106, message: { chat: { id: -100, type: "group", title: "Class" }, from: { id: 7, first_name: "Teacher" }, text: "/endlesson" } });
    expect(dbMocks.updateGroupSessionStatus).toHaveBeenCalledWith("session-1", "ended");
  });

  it("blocks a lesson when the bot is not a group admin", async () => {
    let memberCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("getMe")) return new Response(JSON.stringify({ ok: true, result: { id: 999 } }), { status: 200 });
      if (url.includes("getChatMember")) { memberCalls += 1; return new Response(JSON.stringify({ ok: true, result: { status: memberCalls === 1 ? "administrator" : "member" } }), { status: 200 }); }
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    }));
    await handleTelegramUpdate({ update_id: 104, message: { chat: { id: -100, type: "group", title: "Class" }, from: { id: 7, first_name: "Teacher" }, text: "/lesson biology" } });
    expect(dbMocks.createGroupSession).not.toHaveBeenCalled();
  });
});
