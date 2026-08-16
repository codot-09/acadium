import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramIdentity = {
  telegramId: string;
  chatId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
};

type TelegramWebAppUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

/**
 * Validates the signed initData received from Telegram Mini Apps.
 * Never trust client-supplied Telegram identity fields without this check.
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  nowUnixSeconds = Math.floor(Date.now() / 1000),
): TelegramIdentity {
  if (!botToken) throw new Error("Telegram bot token is not configured");

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const userRaw = params.get("user");

  if (!receivedHash || !authDate || !userRaw) {
    throw new Error("Telegram initData is incomplete");
  }

  if (nowUnixSeconds - authDate > MAX_INIT_DATA_AGE_SECONDS || authDate > nowUnixSeconds + 60) {
    throw new Error("Telegram initData has expired");
  }

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const expected = Buffer.from(calculatedHash, "hex");
  const received = Buffer.from(receivedHash, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error("Telegram initData signature is invalid");
  }

  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    throw new Error("Telegram user payload is invalid");
  }

  if (!user.id || !user.first_name) {
    throw new Error("Telegram user payload is incomplete");
  }

  return {
    telegramId: String(user.id),
    // In a private bot conversation the user ID is the default chat target.
    // A bot update can later replace this with an explicit chat.id when needed.
    chatId: String(user.id),
    firstName: user.first_name,
    lastName: user.last_name ?? null,
    username: user.username ?? null,
    photoUrl: user.photo_url ?? null,
  };
}
