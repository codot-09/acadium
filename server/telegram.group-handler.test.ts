import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  createGroupSession: vi.fn(),
  ensureSessionParticipant: vi.fn(),
  ensureTeacherStudentLink: vi.fn(),
  getActiveGroupSession: vi.fn(),
  recordGroupSessionEvent: vi.fn(),
  updateGroupSessionStatus: vi.fn(),
  upsertTelegramGroupMember: vi.fn(),
  upsertTelegramProfile: vi.fn(),
}));

vi.mock("./db", () => dbMocks);

import { handleTelegramUpdate } from "./telegramBot";

describe("Telegram group lesson handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.upsertTelegramProfile.mockResolvedValue({ id: 10 });
    dbMocks.getActiveGroupSession.mockResolvedValue(undefined);
    dbMocks.createGroupSession.mockResolvedValue({ id: "session-1", topic: "biology" });
    dbMocks.recordGroupSessionEvent.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("getMe")) return new Response(JSON.stringify({ ok: true, result: { id: 999 } }), { status: 200 });
      if (url.includes("getChatMember")) return new Response(JSON.stringify({ ok: true, result: { status: "administrator", can_post_messages: true } }), { status: 200 });
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
