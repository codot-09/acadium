import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  aiMaterials,
  assignments,
  conversations,
  groupSessions,
  messages,
  notifications,
  teacherStudentLinks,
  teacherInvites,
  telegramProfiles,
  type InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { TelegramIdentity } from "./telegram";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  (["name", "email", "loginMethod"] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  if (user.role) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function upsertTelegramProfile(identity: TelegramIdentity) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(telegramProfiles).values({
    telegramId: identity.telegramId,
    chatId: identity.chatId,
    firstName: identity.firstName,
    lastName: identity.lastName,
    username: identity.username,
    photoUrl: identity.photoUrl,
    lastSeenAt: new Date(),
  }).onDuplicateKeyUpdate({
    set: {
      chatId: identity.chatId,
      firstName: identity.firstName,
      lastName: identity.lastName,
      username: identity.username,
      photoUrl: identity.photoUrl,
      lastSeenAt: new Date(),
    },
  });
  return getTelegramProfileByTelegramId(identity.telegramId);
}

export async function getTelegramProfileByTelegramId(telegramId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select().from(telegramProfiles).where(eq(telegramProfiles.telegramId, telegramId)).limit(1);
  return rows[0];
}

export async function getTelegramProfileById(profileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select().from(telegramProfiles).where(eq(telegramProfiles.id, profileId)).limit(1);
  return rows[0];
}

export async function setTelegramProfileRole(profileId: number, role: "teacher" | "student") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(telegramProfiles).set({ role }).where(eq(telegramProfiles.id, profileId));
  const rows = await db.select().from(telegramProfiles).where(eq(telegramProfiles.id, profileId)).limit(1);
  return rows[0];
}

export async function getOrCreateAssistantConversation(profileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await db.select().from(conversations).where(and(
    eq(conversations.ownerProfileId, profileId),
    eq(conversations.kind, "assistant"),
    isNull(conversations.participantProfileId),
  )).limit(1);
  if (existing[0]) return existing[0];
  const id = nanoid();
  await db.insert(conversations).values({ id, ownerProfileId: profileId, kind: "assistant", title: "Acadium Assistant" });
  const created = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return created[0]!;
}

export async function getConversationMessages(conversationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
}

export async function saveMessage(conversationId: string, sender: "user" | "assistant" | "system", content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const id = nanoid();
  await db.insert(messages).values({ id, conversationId, sender, content });
  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  return rows[0]!;
}

export async function getTeacherDashboard(profileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [links, materialRows, sessionRows, assignmentRows] = await Promise.all([
    db.select().from(teacherStudentLinks).where(eq(teacherStudentLinks.teacherProfileId, profileId)),
    db.select().from(aiMaterials).where(eq(aiMaterials.teacherProfileId, profileId)).orderBy(desc(aiMaterials.createdAt)).limit(20),
    db.select().from(groupSessions).where(eq(groupSessions.teacherProfileId, profileId)).orderBy(desc(groupSessions.createdAt)).limit(20),
    db.select().from(assignments).where(eq(assignments.teacherProfileId, profileId)).orderBy(desc(assignments.createdAt)).limit(20),
  ]);
  const studentIds = links.map(link => link.studentProfileId);
  const studentRows = studentIds.length
    ? await db.select().from(telegramProfiles).where(inArray(telegramProfiles.id, studentIds))
    : [];
  return { students: studentRows, materials: materialRows, sessions: sessionRows, assignments: assignmentRows };
}

export async function getStudentDashboard(profileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [assignmentRows, links] = await Promise.all([
    db.select().from(assignments).where(eq(assignments.studentProfileId, profileId)).orderBy(desc(assignments.createdAt)).limit(30),
    db.select().from(teacherStudentLinks).where(eq(teacherStudentLinks.studentProfileId, profileId)),
  ]);
  return { assignments: assignmentRows, teacherLinks: links };
}

export async function createAssignment(input: { teacherProfileId: number; studentProfileId: number; title: string; instructions: string; dueAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const id = nanoid();
  await db.insert(assignments).values({ ...input, id });
  await createNotification(input.studentProfileId, "assignment", `Yangi topshiriq: ${input.title}`);
  const rows = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
  return rows[0]!;
}

export async function createTeacherInvite(createdByUserId: number, expiresInDays = 7) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const code = `AC-${nanoid(16).toUpperCase()}`;
  const id = nanoid();
  await db.insert(teacherInvites).values({ id, code, createdByUserId, expiresAt: new Date(Date.now() + expiresInDays * 86_400_000) });
  return { id, code, expiresAt: new Date(Date.now() + expiresInDays * 86_400_000) };
}

export async function redeemTeacherInvite(code: string, profileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select().from(teacherInvites).where(eq(teacherInvites.code, code)).limit(1);
  const invite = rows[0];
  if (!invite || invite.usedAt || invite.expiresAt.getTime() < Date.now()) return false;
  await db.update(teacherInvites).set({ usedByProfileId: profileId, usedAt: new Date() }).where(eq(teacherInvites.id, invite.id));
  await db.update(telegramProfiles).set({ role: "teacher" }).where(eq(telegramProfiles.id, profileId));
  return true;
}

export async function createNotification(profileId: number, type: "assignment" | "session" | "general", body: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(notifications).values({ id: nanoid(), profileId, type, body });
}
