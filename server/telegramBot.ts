import { analyzeGroupMessage, generateGroupLessonBrief, type GroupLessonBrief } from "./ai";
import { consumeTelegramGroupAnalysisRateLimit, createGroupSession, ensureSessionParticipant, ensureTeacherStudentLink, getActiveGroupSession, getGroupSessionSummary, recordGroupSessionEvent, updateGroupSessionStatus, upsertTelegramGroupMember, upsertTelegramProfile } from "./db";

export type TelegramUpdate = {
  update_id?: number;
  message?: {
    chat?: { id?: number; type?: string; title?: string };
    from?: { id?: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
    text?: string;
    message_id?: number;
    reply_to_message?: { message_id?: number; text?: string; from?: { id?: number; first_name?: string; username?: string } };
  };
  chat_member?: { chat?: { id?: number; type?: string; title?: string }; from?: { id?: number }; new_chat_member?: { status?: string; user?: { id?: number; first_name?: string; last_name?: string; username?: string; photo_url?: string } } };
};

async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Telegram API ${method} failed: ${response.status}`);
  const payload = await response.json() as { ok: boolean; result?: unknown; description?: string };
  if (!payload.ok) throw new Error(payload.description ?? `Telegram API ${method} returned an error`);
  return payload.result;
}

export function verifyWebhookSecret(supplied: string | undefined, expected = process.env.TELEGRAM_WEBHOOK_SECRET) {
  return Boolean(expected && supplied && supplied === expected);
}

export async function processTelegramUpdateOnce(updateId: number | undefined, claim: (id: number) => Promise<boolean>, handler: () => Promise<void>) {
  if (typeof updateId === "number" && !(await claim(updateId))) return false;
  await handler();
  return true;
}

export async function sendTelegramMessage(chatId: string | number, text: string, replyToMessageId?: number) {
  return telegramApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {}) });
}

export async function registerTelegramWebhook() {
  if (process.env.NODE_ENV !== "production" || !process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET) return false;
  const domain = process.env.ACADIUM_PUBLIC_DOMAIN ?? "acadiumai-y23u8tno.manus.space";
  await telegramApi("setWebhook", { url: `https://${domain}/api/telegram/webhook`, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message", "chat_member", "my_chat_member"] });
  return true;
}

export function isGroupAdminMember(status: string | undefined, canPostMessages?: boolean) {
  return (status === "administrator" || status === "creator") && canPostMessages !== false;
}

export function groupEventKey(updateId: number | undefined, suffix: string) {
  return `update:${updateId ?? "unknown"}:${suffix}`;
}

async function isTelegramGroupAdmin(chatId: number, userId: number) {
  const result = await telegramApi("getChatMember", { chat_id: chatId, user_id: userId }) as { status?: string; can_post_messages?: boolean } | undefined;
  return isGroupAdminMember(result?.status, result?.can_post_messages);
}

async function isBotGroupAdmin(chatId: number) {
  const bot = await telegramApi("getMe", {}) as { id?: number } | undefined;
  if (!bot?.id) return false;
  const result = await telegramApi("getChatMember", { chat_id: chatId, user_id: bot.id }) as { status?: string; can_post_messages?: boolean } | undefined;
  return isGroupAdminMember(result?.status, result?.can_post_messages);
}

function escapeTelegramHtml(value: string) { return value.replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] ?? character); }

function formatGroupLessonBrief(brief: GroupLessonBrief) {
  const objectives = brief.objectives.slice(0, 4).map(item => `• ${escapeTelegramHtml(item)}`).join("\n");
  const keyPoints = brief.keyPoints.slice(0, 5).map(item => `• ${escapeTelegramHtml(item)}`).join("\n");
  const resources = brief.resources.slice(0, 3).map(resource => `• <b>${escapeTelegramHtml(resource.title)}</b>: ${escapeTelegramHtml(resource.summary)}\n  Qidiruv: <code>${escapeTelegramHtml(resource.searchQuery)}</code>`).join("\n");
  return `<b>Acadium online lesson: ${escapeTelegramHtml(brief.title)}</b>\n\n${escapeTelegramHtml(brief.overview)}\n\n<b>Maqsadlar</b>\n${objectives}\n\n<b>Asosiy nuqtalar</b>\n${keyPoints}\n\n<b>Resurslar</b>\n${resources}\n\n<b>Birinchi savol</b>\n${escapeTelegramHtml(brief.firstQuestion)}\n\nJavobingizni shu xabarga reply qiling. Acadium javobingizni tahlil qiladi va keyingi qadamni tavsiya qiladi.`;
}

function parseLessonBrief(value: string | null | undefined): GroupLessonBrief | null { if (!value) return null; try { return JSON.parse(value) as GroupLessonBrief; } catch { return null; } }

export function parseGroupCommand(text: string) {
  const match = text.match(/^\/(lesson|ask|endlesson)(?:@[^\s]+)?(?:\s+([\s\S]+))?$/i);
  return match ? { command: match[1].toLowerCase(), argument: match[2]?.trim() ?? "" } : null;
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const membership = update.chat_member;
  if (membership?.chat?.id && membership.new_chat_member?.user?.id && membership.new_chat_member.user.first_name && ["member", "restricted", "administrator", "creator"].includes(membership.new_chat_member.status ?? "")) {
    const member = membership.new_chat_member.user;
    const firstName = member.first_name;
    if (!firstName) return;
    const profile = await upsertTelegramProfile({ telegramId: String(member.id), chatId: String(member.id), firstName, lastName: member.last_name ?? null, username: member.username ?? null, photoUrl: member.photo_url ?? null });
    await upsertTelegramGroupMember({ telegramGroupId: String(membership.chat.id), profileId: profile.id, status: membership.new_chat_member.status as "member" | "restricted" | "administrator" | "creator" | "left" | "kicked" });
    const active = await getActiveGroupSession(String(membership.chat.id));
    if (active && profile) {
      await ensureSessionParticipant(active.id, profile.id);
      await ensureTeacherStudentLink(active.teacherProfileId, profile.id);
      await recordGroupSessionEvent({ sessionId: active.id, profileId: profile.id, telegramUserId: String(member.id), eventType: "join", content: "Member joined the active lesson", eventKey: `update:${update.update_id ?? "unknown"}:member:${member.id}` });
    }
    return;
  }
  const message = update.message;
  const chat = message?.chat;
  const from = message?.from;
  if (!message || !chat?.id || !from?.id || !from.first_name) return;
  const isGroup = chat.type === "group" || chat.type === "supergroup";
  const profile = await upsertTelegramProfile({ telegramId: String(from.id), chatId: String(from.id), firstName: from.first_name, lastName: from.last_name ?? null, username: from.username ?? null, photoUrl: from.photo_url ?? null });
  if (!profile) return;
  if (isGroup) await upsertTelegramGroupMember({ telegramGroupId: String(chat.id), profileId: profile.id, status: "member" });
  const text = message.text?.trim() ?? "";

  if (!isGroup) {
    if (text === "/start") await sendTelegramMessage(chat.id, "<b>Acadiumga xush kelibsiz.</b>\n\nWeb App’ni oching va dars rejangizni bir prompt bilan yarating.");
    return;
  }

  const command = parseGroupCommand(text);
  if (command?.command === "lesson") {
    const isAdmin = await isTelegramGroupAdmin(chat.id, from.id);
    if (!isAdmin) { await sendTelegramMessage(chat.id, "Faqat guruh administratori online lesson boshlashi mumkin."); return; }
    if (!(await isBotGroupAdmin(chat.id))) { await sendTelegramMessage(chat.id, "Acadium bot guruhda administrator bo‘lishi va xabar yuborish huquqiga ega bo‘lishi kerak."); return; }
    if (!command.argument) { await sendTelegramMessage(chat.id, "Format: <code>/lesson fotosintez-8-sinf</code>"); return; }
    const active = await getActiveGroupSession(String(chat.id));
    if (active) { await sendTelegramMessage(chat.id, `<b>Lesson allaqachon davom etmoqda.</b>\n\nTopic: ${active.topic}`); return; }
    let brief: GroupLessonBrief;
    try { brief = await generateGroupLessonBrief(command.argument); } catch (error) { console.error("[Telegram lesson] Brief generation failed:", error); await sendTelegramMessage(chat.id, "Acadium bu mavzu uchun lesson materialini hozir yaratolmadi. Iltimos, mavzuni qisqaroq qilib qayta yuboring."); return; }
    const session = await createGroupSession({ teacherProfileId: profile.id, telegramGroupId: String(chat.id), groupTitle: chat.title ?? "Telegram group", title: brief.title, topic: command.argument, lessonBriefJson: JSON.stringify(brief) });
    await ensureSessionParticipant(session.id, profile.id);
    await recordGroupSessionEvent({ sessionId: session.id, profileId: profile.id, telegramUserId: String(from.id), eventType: "system", content: `Lesson started: ${command.argument}`, eventKey: `update:${update.update_id ?? "unknown"}:lesson` });
    await recordGroupSessionEvent({ sessionId: session.id, profileId: profile.id, telegramUserId: String(from.id), eventType: "system", content: JSON.stringify({ type: "lesson_brief", brief }), eventKey: `session:${session.id}:brief` });
    await Promise.all(brief.resources.slice(0, 5).map((resource, index) => recordGroupSessionEvent({ sessionId: session.id, profileId: profile.id, telegramUserId: String(from.id), eventType: "system", content: JSON.stringify({ type: "resource", resource }), eventKey: `session:${session.id}:resource:${index}` })));
    await sendTelegramMessage(chat.id, formatGroupLessonBrief(brief));
    return;
  }

  const active = await getActiveGroupSession(String(chat.id));
  if (!active) {
    if (text === "/start") await sendTelegramMessage(chat.id, "Guruh lessonini boshlash uchun teacher <code>/lesson mavzu-slug</code> yozishi kerak.");
    return;
  }

  const senderIsAdmin = await isTelegramGroupAdmin(chat.id, from.id);
  if (!senderIsAdmin) {
    await upsertTelegramGroupMember({ telegramGroupId: String(chat.id), profileId: profile.id, status: "member" });
    await ensureSessionParticipant(active.id, profile.id);
    await ensureTeacherStudentLink(active.teacherProfileId, profile.id);
  }
  if (command?.command === "endlesson") {
    if (!senderIsAdmin) { await sendTelegramMessage(chat.id, "Faqat lessonni boshlagan teacher yoki guruh administratori lessonni tugata oladi."); return; }
    await updateGroupSessionStatus(active.id, "ended");
    await recordGroupSessionEvent({ sessionId: active.id, profileId: profile.id, telegramUserId: String(from.id), eventType: "system", content: "Lesson ended", eventKey: `update:${update.update_id ?? "unknown"}:endlesson` });
    const summary = await getGroupSessionSummary(active.id);
    await sendTelegramMessage(chat.id, `<b>Lesson yakunlandi.</b>\n\nAttendance: <b>${summary.attendance}</b>\nJavoblar: <b>${summary.responses}</b>\nSavollar: <b>${summary.questions}</b>\nAI tahlillar: <b>${summary.analyzed}</b>\n\nBatafsil natijalar Analyze menyusida saqlandi.`);
    return;
  }
  if (command?.command === "ask") {
    if (!senderIsAdmin) { await sendTelegramMessage(chat.id, "Savol yuborish uchun teacher guruh administratori bo‘lishi kerak."); return; }
    if (!command.argument) { await sendTelegramMessage(chat.id, "Format: <code>/ask Fotosintezning asosiy bosqichi nima?</code>"); return; }
    await recordGroupSessionEvent({ sessionId: active.id, profileId: profile.id, telegramUserId: String(from.id), eventType: "question", content: command.argument, eventKey: `update:${update.update_id ?? "unknown"}:ask` });
    await sendTelegramMessage(chat.id, `<b>Teacher savoli:</b>\n\n${command.argument}\n\nJavobingizni shu guruhda yozing.`);
    return;
  }
  if (text && !text.startsWith("/")) {
    if (senderIsAdmin) {
      await recordGroupSessionEvent({ sessionId: active.id, profileId: profile.id, telegramUserId: String(from.id), eventType: "message", content: text, eventKey: `update:${update.update_id ?? "unknown"}:message`, replyToMessageId: message.message_id ? String(message.message_id) : undefined });
      return;
    }
    const allowed = await consumeTelegramGroupAnalysisRateLimit(`group:${chat.id}:profile:${profile.id}`, 8, 60_000);
    if (!allowed) { await sendTelegramMessage(chat.id, "Acadium hozir juda ko‘p javoblarni tahlil qilmoqda. Iltimos, bir daqiqa kutib qayta yozing.", message.message_id); return; }
    const brief = parseLessonBrief(active.lessonBriefJson);
    const replyContext = message.reply_to_message?.text ? `Original Telegram lesson message:\n${message.reply_to_message.text}` : undefined;
    const referencedMessageId = message.reply_to_message?.message_id ?? message.message_id;
    let analysis;
    try { analysis = replyContext ? await analyzeGroupMessage(active.topic, brief, text, replyContext) : await analyzeGroupMessage(active.topic, brief, text); } catch (error) { console.error("[Telegram lesson] Student analysis failed:", error); await recordGroupSessionEvent({ sessionId: active.id, profileId: profile.id, telegramUserId: String(from.id), eventType: "answer", content: text, eventKey: `update:${update.update_id ?? "unknown"}:message`, replyToMessageId: referencedMessageId ? String(referencedMessageId) : undefined }); await sendTelegramMessage(chat.id, "Javobingiz qabul qilindi. Acadium tahlilini yakunlay olmadi; teacher keyinroq ko‘rib chiqadi.", message.message_id); return; }
    const eventType = analysis.classification === "question" ? "question" : "answer";
    await recordGroupSessionEvent({ sessionId: active.id, profileId: profile.id, telegramUserId: String(from.id), eventType, content: text, eventKey: `update:${update.update_id ?? "unknown"}:message`, analysisJson: JSON.stringify({ ...analysis, replyContext }), replyToMessageId: referencedMessageId ? String(referencedMessageId) : undefined });
    const teacherNote = analysis.needsTeacher ? "\n\n<i>Teacher uchun: bu javob shaxsiy follow-up talab qilishi mumkin.</i>" : "";
    await sendTelegramMessage(chat.id, `<b>Acadium tahlili</b>\n\n${escapeTelegramHtml(analysis.reply)}\n\n<i>Keyingi qadam: ${escapeTelegramHtml(analysis.suggestedNextStep)}</i>${teacherNote}`, message.message_id);
  }
}
