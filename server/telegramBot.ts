import { upsertTelegramProfile } from "./db";

export type TelegramUpdate = {
  message?: {
    chat?: { id?: number; type?: string; title?: string };
    from?: { id?: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
    text?: string;
  };
};

async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Telegram API ${method} failed: ${response.status}`);
  return response.json();
}

export function verifyWebhookSecret(supplied: string | undefined, expected = process.env.TELEGRAM_WEBHOOK_SECRET) {
  return Boolean(expected && supplied && supplied === expected);
}

export async function sendTelegramMessage(chatId: string | number, text: string) {
  return telegramApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  const chat = message?.chat;
  const from = message?.from;
  if (!message || !chat?.id || !from?.id || !from.first_name) return;

  await upsertTelegramProfile({
    telegramId: String(from.id),
    chatId: String(chat.id),
    firstName: from.first_name,
    lastName: from.last_name ?? null,
    username: from.username ?? null,
    photoUrl: from.photo_url ?? null,
  });

  const text = message.text?.trim() ?? "";
  if (text === "/start") {
    await sendTelegramMessage(chat.id, "<b>Acadiumga xush kelibsiz.</b>\n\nWeb App’ni oching va dars rejangizni bir prompt bilan yarating.");
    return;
  }
  if (text === "/session" && chat.type !== "private") {
    await sendTelegramMessage(chat.id, "<b>Session tayyor.</b>\n\nO‘qituvchi Acadium panelidan savol yuborishi mumkin. O‘quvchilar javoblarini shu guruhda yuboradi.");
    return;
  }
  if (text && chat.type !== "private") {
    await sendTelegramMessage(chat.id, "Savol qabul qilindi. O‘qituvchi uni Acadium session panelida ko‘rib chiqadi.");
  }
}
