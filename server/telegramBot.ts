import { createGroupSession, ensureSessionParticipant, ensureTeacherStudentLink, getActiveGroupSession, recordGroupSessionEvent, updateGroupSessionStatus, upsertTelegramGroupMember, upsertTelegramProfile } from "./db";

export type TelegramUpdate = {
  update_id?: number;
  message?: {
    chat?: { id?: number; type?: string; title?: string };
    from?: { id?: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
    text?: string;
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

export async function sendTelegramMessage(chatId: string | number, text: string) {
  return telegramApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
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
    const session = await createGroupSession({ teacherProfileId: profile.id, telegramGroupId: String(chat.id), groupTitle: chat.title ?? "Telegram group", title: command.argument, topic: command.argument });
    await ensureSessionParticipant(session.id, profile.id);
    await recordGroupSessionEvent({ sessionId: session.id, profileId: profile.id, telegramUserId: String(from.id), eventType: "system", content: `Lesson started: ${command.argument}`, eventKey: `update:${update.update_id ?? "unknown"}:lesson` });
    await sendTelegramMessage(chat.id, `<b>Acadium lesson boshlandi.</b>\n\nTopic: <b>${command.argument}</b>\n\nO‘quvchilar savolga javob berishlari mumkin. Teacher savol yuborish uchun <code>/ask savol</code> komandasi, tugatish uchun <code>/endlesson</code> komandasi ishlatiladi.`);
    return;
  }

  const active = await getActiveGroupSession(String(chat.id));
  if (!active) {
    if (text === "/start") await sendTelegramMessage(chat.id, "Guruh lessonini boshlash uchun teacher <code>/lesson mavzu-slug</code> yozishi kerak.");
    return;
  }

  await ensureSessionParticipant(active.id, profile.id);
  await ensureTeacherStudentLink(active.teacherProfileId, profile.id);
  if (command?.command === "endlesson") {
    if (!(await isTelegramGroupAdmin(chat.id, from.id))) { await sendTelegramMessage(chat.id, "Faqat lessonni boshlagan teacher yoki guruh administratori lessonni tugata oladi."); return; }
    await updateGroupSessionStatus(active.id, "ended");
    await recordGroupSessionEvent({ sessionId: active.id, profileId: profile.id, telegramUserId: String(from.id), eventType: "system", content: "Lesson ended", eventKey: `update:${update.update_id ?? "unknown"}:endlesson` });
    await sendTelegramMessage(chat.id, "<b>Lesson yakunlandi.</b>\n\nAcadium student participation va javoblarini Analyze menyusida saqladi.");
    return;
  }
  if (command?.command === "ask") {
    if (!(await isTelegramGroupAdmin(chat.id, from.id))) { await sendTelegramMessage(chat.id, "Savol yuborish uchun teacher guruh administratori bo‘lishi kerak."); return; }
    if (!command.argument) { await sendTelegramMessage(chat.id, "Format: <code>/ask Fotosintezning asosiy bosqichi nima?</code>"); return; }
    await recordGroupSessionEvent({ sessionId: active.id, profileId: profile.id, telegramUserId: String(from.id), eventType: "question", content: command.argument, eventKey: `update:${update.update_id ?? "unknown"}:ask` });
    await sendTelegramMessage(chat.id, `<b>Teacher savoli:</b>\n\n${command.argument}\n\nJavobingizni shu guruhda yozing.`);
    return;
  }
  if (text && !text.startsWith("/")) {
    const senderIsAdmin = await isTelegramGroupAdmin(chat.id, from.id);
    await recordGroupSessionEvent({ sessionId: active.id, profileId: profile.id, telegramUserId: String(from.id), eventType: senderIsAdmin ? "message" : "answer", content: text, eventKey: `update:${update.update_id ?? "unknown"}:message` });
  }
}
