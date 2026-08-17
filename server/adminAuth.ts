import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "acadium_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type AdminSessionPayload = { sub: "admin"; exp: number };

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function configuredSecret(name: "ACADIUM_ADMIN_LOGIN" | "ACADIUM_ADMIN_PASSWORD") {
  return process.env[name] ?? "";
}

export function verifyAdminCredentials(login: string, password: string) {
  const configuredLogin = configuredSecret("ACADIUM_ADMIN_LOGIN");
  const configuredPassword = configuredSecret("ACADIUM_ADMIN_PASSWORD");
  if (!configuredLogin || !configuredPassword || login.length > 256 || password.length > 512) return false;
  const loginDigest = digest(login);
  const configuredLoginDigest = digest(configuredLogin);
  const passwordDigest = digest(password);
  const configuredPasswordDigest = digest(configuredPassword);
  return timingSafeEqual(loginDigest, configuredLoginDigest) && timingSafeEqual(passwordDigest, configuredPasswordDigest);
}

function signingSecret() {
  return process.env.JWT_SECRET || "acadium-admin-session-development-secret";
}

function encodePayload(payload: AdminSessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export function createAdminSession(now = Date.now()) {
  const payload = encodePayload({ sub: "admin", exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS });
  return `${payload}.${sign(payload)}`;
}

export function getAdminCookie(cookieHeader: string | undefined) {
  const pair = cookieHeader?.split(";").map(value => value.trim()).find(value => value.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  return pair ? decodeURIComponent(pair.slice(ADMIN_SESSION_COOKIE.length + 1)) : undefined;
}

export function verifyAdminSession(token: string | undefined, now = Date.now()) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expectedSignature = sign(payload);
  if (signature.length !== expectedSignature.length) return false;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSessionPayload;
    return parsed.sub === "admin" && Number.isFinite(parsed.exp) && parsed.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}
