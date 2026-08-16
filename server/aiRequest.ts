export function getTelegramInitData(initData: unknown, botToken: unknown) {
  const normalizedInitData = typeof initData === "string" ? initData.trim() : "";
  return normalizedInitData && typeof botToken === "string" && botToken.trim() ? normalizedInitData : null;
}
