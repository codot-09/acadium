import { and, desc, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  aiMaterials,
  assignments,
  conversations,
  groupSessions,
  groupSessionEvents,
  sessionParticipants,
  telegramGroupMembers,
  telegramProcessedUpdates,
  telegramGroupAnalysisRateLimits,
  messages,
  notifications,
  submissions,
  teacherStudentLinks,
  teacherInvites,
  teacherSources,
  teacherAiSettings,
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

export async function getTeacherAiMode(teacherProfileId: number): Promise<"web" | "local"> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select().from(teacherAiSettings).where(eq(teacherAiSettings.teacherProfileId, teacherProfileId)).limit(1);
  return rows[0]?.mode ?? "web";
}

export async function setTeacherAiMode(teacherProfileId: number, mode: "web" | "local") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(teacherAiSettings).values({ teacherProfileId, mode }).onDuplicateKeyUpdate({ set: { mode, updatedAt: new Date() } });
  const rows = await db.select().from(teacherAiSettings).where(eq(teacherAiSettings.teacherProfileId, teacherProfileId)).limit(1);
  return rows[0]!;
}

export async function getTeacherSources(teacherProfileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select({ id: teacherSources.id, name: teacherSources.name, mimeType: teacherSources.mimeType, sizeBytes: teacherSources.sizeBytes, status: teacherSources.status, extractedText: teacherSources.extractedText, createdAt: teacherSources.createdAt }).from(teacherSources).where(and(eq(teacherSources.teacherProfileId, teacherProfileId), eq(teacherSources.status, "ready"))).orderBy(desc(teacherSources.createdAt));
}

export async function getTeacherSourceContext(teacherProfileId: number, sourceIdsJson?: string | null) {
  const sources = await getTeacherSources(teacherProfileId);
  if (!sourceIdsJson) return sources;
  try {
    const sourceIds = JSON.parse(sourceIdsJson) as string[];
    if (!Array.isArray(sourceIds)) return sources;
    const allowed = new Set(sourceIds);
    return sources.filter(source => allowed.has(source.id));
  } catch {
    return sources;
  }
}

export async function createTeacherSource(input: { id: string; teacherProfileId: number; name: string; storageKey: string; mimeType: string; sizeBytes: number; extractedText: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(teacherSources).values(input);
  const rows = await db.select({ id: teacherSources.id, name: teacherSources.name, mimeType: teacherSources.mimeType, sizeBytes: teacherSources.sizeBytes, status: teacherSources.status, extractedText: teacherSources.extractedText, createdAt: teacherSources.createdAt }).from(teacherSources).where(eq(teacherSources.id, input.id)).limit(1);
  return rows[0]!;
}

export async function archiveTeacherSource(teacherProfileId: number, sourceId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(teacherSources).set({ status: "archived" }).where(and(eq(teacherSources.id, sourceId), eq(teacherSources.teacherProfileId, teacherProfileId), eq(teacherSources.status, "ready")));
  return true;
}

export async function getOrCreateIndividualConversation(teacherProfileId: number, studentProfileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await db.select().from(conversations).where(and(eq(conversations.ownerProfileId, teacherProfileId), eq(conversations.participantProfileId, studentProfileId), eq(conversations.kind, "individual"))).limit(1);
  if (existing[0]) return existing[0];
  const id = nanoid();
  await db.insert(conversations).values({ id, ownerProfileId: teacherProfileId, participantProfileId: studentProfileId, kind: "individual", title: "Student conversation" });
  const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return rows[0]!;
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

export async function createAssistantConversation(profileId: number, title = "New chat") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const id = nanoid();
  await db.insert(conversations).values({ id, ownerProfileId: profileId, kind: "assistant", title });
  const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return rows[0]!;
}

export async function deleteConversationForOwner(profileId: number, conversationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const conversation = await getConversationById(conversationId);
  if (!conversation || conversation.ownerProfileId !== profileId) return false;
  await db.transaction(async tx => {
    await tx.delete(messages).where(eq(messages.conversationId, conversationId));
    await tx.delete(conversations).where(eq(conversations.id, conversationId));
  });
  return true;
}

export async function getUserConversations(profileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select().from(conversations).where(eq(conversations.ownerProfileId, profileId)).orderBy(desc(conversations.updatedAt));
}

export async function getConversationById(conversationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  return rows[0];
}

export async function getConversationMessages(conversationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
}

export async function saveMessage(conversationId: string, sender: "user" | "assistant" | "system" | "teacher" | "student", content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const id = nanoid();
  await db.insert(messages).values({ id, conversationId, sender, content });
  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  return rows[0]!;
}

export async function getTeacherAnalytics(profileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [links, materials, sessions, assignmentsForTeacher] = await Promise.all([
    db.select().from(teacherStudentLinks).where(eq(teacherStudentLinks.teacherProfileId, profileId)),
    db.select({ id: aiMaterials.id, createdAt: aiMaterials.createdAt }).from(aiMaterials).where(eq(aiMaterials.teacherProfileId, profileId)),
    db.select({ id: groupSessions.id, title: groupSessions.title, groupTitle: groupSessions.groupTitle, status: groupSessions.status, createdAt: groupSessions.createdAt }).from(groupSessions).where(eq(groupSessions.teacherProfileId, profileId)),
    db.select({ id: assignments.id, status: assignments.status, createdAt: assignments.createdAt }).from(assignments).where(eq(assignments.teacherProfileId, profileId)),
  ]);
  const assignmentIds = assignmentsForTeacher.map(item => item.id);
  const sessionIds = sessions.map(item => item.id);
  const [submissionsForTeacher, sessionMembers, sessionEvents] = await Promise.all([
    assignmentIds.length ? db.select().from(submissions).where(inArray(submissions.assignmentId, assignmentIds)) : Promise.resolve([]),
    sessionIds.length ? db.select().from(sessionParticipants).where(inArray(sessionParticipants.sessionId, sessionIds)) : Promise.resolve([]),
    sessionIds.length ? db.select().from(groupSessionEvents).where(inArray(groupSessionEvents.sessionId, sessionIds)) : Promise.resolve([]),
  ]);
  const reviewed = submissionsForTeacher.filter(item => item.status === "reviewed").length;
  const activityMap = new Map<string, { label: string; materials: number; sessions: number; assignments: number }>();
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    activityMap.set(key, { label: date.toLocaleDateString("en-US", { weekday: "short" }), materials: 0, sessions: 0, assignments: 0 });
  }
  const increment = (date: Date, field: "materials" | "sessions" | "assignments") => { const item = activityMap.get(new Date(date).toISOString().slice(0, 10)); if (item) item[field] += 1; };
  materials.forEach(item => increment(item.createdAt, "materials")); sessions.forEach(item => increment(item.createdAt, "sessions")); assignmentsForTeacher.forEach(item => increment(item.createdAt, "assignments"));
  const uniqueGroupStudents = new Set(sessionMembers.map(item => item.profileId));
  const groupAnswers = sessionEvents.filter(item => item.eventType === "answer").length;
  const profileIds = Array.from(uniqueGroupStudents);
  const groupProfiles = profileIds.length ? await db.select().from(telegramProfiles).where(inArray(telegramProfiles.id, profileIds)) : [];
  const groupStudentBreakdown = groupProfiles.map(profile => {
    const events = sessionEvents.filter(event => event.profileId === profile.id);
    const analyses = events.flatMap(event => { if (!event.analysisJson) return []; try { return [JSON.parse(event.analysisJson) as { classification?: string; confidence?: number; needsTeacher?: boolean }]; } catch { return []; } });
    const confidences = analyses.map(item => item.confidence).filter((value): value is number => typeof value === "number");
    const lastAnalysis = analyses[analyses.length - 1];
    return { profileId: profile.id, name: [profile.firstName, profile.lastName].filter(Boolean).join(" "), username: profile.username, attendance: new Set(events.map(event => event.sessionId)).size, participation: events.filter(event => ["message", "answer", "question"].includes(event.eventType)).length, answers: events.filter(event => event.eventType === "answer").length, questions: events.filter(event => event.eventType === "question").length, averageConfidence: confidences.length ? Math.round((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100) : null, needsTeacher: analyses.some(item => item.needsTeacher === true), lastClassification: lastAnalysis?.classification ?? null, lastActivity: events.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]?.createdAt ?? null };
  }).sort((left, right) => right.participation - left.participation);
  const sessionAnalytics = sessions.map(session => {
    const members = sessionMembers.filter(member => member.sessionId === session.id);
    const events = sessionEvents.filter(event => event.sessionId === session.id);
    return { sessionId: session.id, title: session.title, groupTitle: session.groupTitle, status: session.status, attendance: members.length, responses: events.filter(event => event.eventType === "answer").length, participation: events.filter(event => ["message", "answer", "question"].includes(event.eventType)).length, lastActivity: events.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]?.createdAt ?? session.createdAt };
  });
  return { students: links.length, materials: materials.length, sessions: sessions.length, assignments: assignmentsForTeacher.length, submissions: submissionsForTeacher.length, reviewedSubmissions: reviewed, reviewRate: submissionsForTeacher.length ? Math.round((reviewed / submissionsForTeacher.length) * 100) : 0, groupStudents: uniqueGroupStudents.size, groupMessages: sessionEvents.filter(item => item.eventType === "message" || item.eventType === "answer").length, groupAnswers, groupStudentBreakdown, sessionAnalytics, activity: Array.from(activityMap.values()) };
}

export async function getTeacherGroupSessions(teacherProfileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select().from(groupSessions).where(eq(groupSessions.teacherProfileId, teacherProfileId)).orderBy(desc(groupSessions.createdAt));
}

export async function updateTeacherGroupSessionStatus(teacherProfileId: number, sessionId: string, status: "live" | "paused" | "ended") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select({ id: groupSessions.id }).from(groupSessions).where(and(eq(groupSessions.id, sessionId), eq(groupSessions.teacherProfileId, teacherProfileId))).limit(1);
  if (!rows[0]) return null;
  const now = new Date();
  await db.update(groupSessions).set({ status, ...(status === "live" ? { startedAt: now, endedAt: null } : status === "ended" ? { endedAt: now } : {}) }).where(eq(groupSessions.id, sessionId));
  return db.select().from(groupSessions).where(eq(groupSessions.id, sessionId)).limit(1).then(result => result[0] ?? null);
}

export async function getTeacherGroupSessionDetail(teacherProfileId: number, sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [sessionRows, participantRows, eventRows] = await Promise.all([
    db.select().from(groupSessions).where(and(eq(groupSessions.id, sessionId), eq(groupSessions.teacherProfileId, teacherProfileId))).limit(1),
    db.select({ participant: sessionParticipants, profile: telegramProfiles }).from(sessionParticipants).innerJoin(telegramProfiles, eq(sessionParticipants.profileId, telegramProfiles.id)).where(eq(sessionParticipants.sessionId, sessionId)),
    db.select({ event: groupSessionEvents, profile: telegramProfiles }).from(groupSessionEvents).innerJoin(telegramProfiles, eq(groupSessionEvents.profileId, telegramProfiles.id)).where(eq(groupSessionEvents.sessionId, sessionId)).orderBy(groupSessionEvents.createdAt),
  ]);
  if (!sessionRows[0]) return null;
  return { session: sessionRows[0], participants: participantRows, events: eventRows };
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

export async function getStudentSubmissionsForTeacher(teacherProfileId: number, studentProfileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select({ submission: submissions, assignment: assignments }).from(submissions).innerJoin(assignments, eq(submissions.assignmentId, assignments.id)).where(and(eq(assignments.teacherProfileId, teacherProfileId), eq(submissions.studentProfileId, studentProfileId))).orderBy(desc(submissions.submittedAt));
}

export async function saveAiMaterial(input: { teacherProfileId: number; prompt: string; material: { title: string; lessonPlan: string; quiz: string; slides: Array<{ title: string; content: string; imageDescription: string }> } }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const id = nanoid();
  await db.insert(aiMaterials).values({ id, teacherProfileId: input.teacherProfileId, prompt: input.prompt, title: input.material.title, lessonPlan: input.material.lessonPlan, quiz: input.material.quiz, slidesJson: JSON.stringify(input.material.slides) });
  return (await db.select().from(aiMaterials).where(eq(aiMaterials.id, id)).limit(1))[0]!;
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

export async function getActiveGroupSession(telegramGroupId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select().from(groupSessions).where(and(eq(groupSessions.telegramGroupId, telegramGroupId), inArray(groupSessions.status, ["live", "paused"]))).orderBy(desc(groupSessions.createdAt)).limit(1);
  return rows[0];
}

export async function consumeTelegramGroupAnalysisRateLimit(rateKey: string, maxRequests: number, windowMs: number, now = Date.now()) {
  const db = await getDb();
  if (!db) return true;
  const windowStart = new Date(now);
  const cutoff = new Date(now - windowMs);
  await db.insert(telegramGroupAnalysisRateLimits).values({ rateKey, windowStartedAt: windowStart, requestCount: 1 }).onDuplicateKeyUpdate({ set: {
    windowStartedAt: sql`IF(${telegramGroupAnalysisRateLimits.windowStartedAt} < ${cutoff}, ${windowStart}, ${telegramGroupAnalysisRateLimits.windowStartedAt})`,
    requestCount: sql`IF(${telegramGroupAnalysisRateLimits.windowStartedAt} < ${cutoff}, 1, ${telegramGroupAnalysisRateLimits.requestCount} + 1)`,
  } });
  const [row] = await db.select({ requestCount: telegramGroupAnalysisRateLimits.requestCount }).from(telegramGroupAnalysisRateLimits).where(eq(telegramGroupAnalysisRateLimits.rateKey, rateKey)).limit(1);
  return (row?.requestCount ?? 0) <= maxRequests;
}

export async function markTelegramUpdateProcessed(updateId: number | string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const key = String(updateId);
  const existing = await db.select().from(telegramProcessedUpdates).where(eq(telegramProcessedUpdates.updateId, key)).limit(1);
  if (existing[0]) return false;
  try { await db.insert(telegramProcessedUpdates).values({ updateId: key }); return true; } catch { return false; }
}

export async function claimTelegramUpdate(updateId: number | string) {
  return markTelegramUpdateProcessed(updateId);
}

export async function upsertTelegramGroupMember(input: { telegramGroupId: string; profileId: number; status: "member" | "restricted" | "administrator" | "creator" | "left" | "kicked" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await db.select().from(telegramGroupMembers).where(and(eq(telegramGroupMembers.telegramGroupId, input.telegramGroupId), eq(telegramGroupMembers.profileId, input.profileId))).limit(1);
  if (existing[0]) {
    await db.update(telegramGroupMembers).set({ status: input.status, lastSeenAt: new Date() }).where(eq(telegramGroupMembers.id, existing[0].id));
    return;
  }
  await db.insert(telegramGroupMembers).values(input);
}

export async function updateGroupSessionStatus(sessionId: string, status: "planned" | "live" | "paused" | "ended") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(groupSessions).set({ status, endedAt: status === "ended" ? new Date() : undefined }).where(eq(groupSessions.id, sessionId));
  return (await db.select().from(groupSessions).where(eq(groupSessions.id, sessionId)).limit(1))[0];
}

export async function ensureTeacherStudentLink(teacherProfileId: number, studentProfileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await db.select().from(teacherStudentLinks).where(and(eq(teacherStudentLinks.teacherProfileId, teacherProfileId), eq(teacherStudentLinks.studentProfileId, studentProfileId))).limit(1);
  if (!existing[0]) await db.insert(teacherStudentLinks).values({ teacherProfileId, studentProfileId });
}

export async function ensureSessionParticipant(sessionId: string, profileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await db.select().from(sessionParticipants).where(and(eq(sessionParticipants.sessionId, sessionId), eq(sessionParticipants.profileId, profileId))).limit(1);
  if (!existing[0]) await db.insert(sessionParticipants).values({ sessionId, profileId });
}

export async function recordGroupSessionEvent(input: { sessionId: string; profileId: number; telegramUserId: string; eventType: "join" | "message" | "question" | "answer" | "system"; content: string; eventKey?: string; analysisJson?: string; replyToMessageId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  try { await db.insert(groupSessionEvents).values(input); return true; } catch { return false; }
}

export async function getGroupSessionSummary(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [session, members, events] = await Promise.all([
    db.select().from(groupSessions).where(eq(groupSessions.id, sessionId)).limit(1),
    db.select().from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId)),
    db.select().from(groupSessionEvents).where(eq(groupSessionEvents.sessionId, sessionId)),
  ]);
  return { session: session[0], attendance: members.length, responses: events.filter(event => event.eventType === "answer").length, questions: events.filter(event => event.eventType === "question").length, analyzed: events.filter(event => Boolean(event.analysisJson)).length, lastActivity: events.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]?.createdAt ?? null };
}

export async function createGroupSession(input: { teacherProfileId: number; telegramGroupId: string; groupTitle: string; title: string; topic: string; aiMode?: "web" | "local"; sourceIdsJson?: string; lessonBriefJson?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const id = nanoid();
  await db.insert(groupSessions).values({ ...input, id, status: "live", startedAt: new Date() });
  const links = await db.select().from(teacherStudentLinks).where(eq(teacherStudentLinks.teacherProfileId, input.teacherProfileId));
  await Promise.all(links.map(link => createNotification(link.studentProfileId, "session", `Yangi online session: ${input.title}`)));
  return (await db.select().from(groupSessions).where(eq(groupSessions.id, id)).limit(1))[0]!;
}

export async function submitAssignment(input: { assignmentId: string; studentProfileId: number; response: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const id = nanoid();
  await db.insert(submissions).values({ id, ...input });
  await db.update(assignments).set({ status: "submitted" }).where(eq(assignments.id, input.assignmentId));
  return (await db.select().from(submissions).where(eq(submissions.id, id)).limit(1))[0]!;
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
  const id = nanoid();
  await db.insert(notifications).values({ id, profileId, type, body });
  const profileRows = await db.select({ chatId: telegramProfiles.chatId }).from(telegramProfiles).where(eq(telegramProfiles.id, profileId)).limit(1);
  const chatId = profileRows[0]?.chatId;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token) return { id, deliveryStatus: "queued" as const };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: body }) });
    if (!response.ok) throw new Error(`Telegram notification failed: ${response.status}`);
    await db.update(notifications).set({ deliveryStatus: "sent", sentAt: new Date() }).where(eq(notifications.id, id));
    return { id, deliveryStatus: "sent" as const };
  } catch {
    await db.update(notifications).set({ deliveryStatus: "failed" }).where(eq(notifications.id, id));
    return { id, deliveryStatus: "failed" as const };
  }
}
