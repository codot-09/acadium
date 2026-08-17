import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/** Core identity table used by the Manus OAuth scaffold. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const telegramProfiles = mysqlTable("telegram_profiles", {
  id: int("id").autoincrement().primaryKey(),
  telegramId: varchar("telegramId", { length: 64 }).notNull().unique(),
  chatId: varchar("chatId", { length: 64 }).notNull(),
  firstName: varchar("firstName", { length: 128 }).notNull(),
  lastName: varchar("lastName", { length: 128 }),
  username: varchar("username", { length: 128 }),
  photoUrl: text("photoUrl"),
  role: mysqlEnum("academyRole", ["teacher", "student"]).default("student").notNull(),
  isTelegramActive: boolean("isTelegramActive").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
});

export const conversations = mysqlTable("conversations", {
  id: varchar("id", { length: 32 }).primaryKey(),
  ownerProfileId: int("ownerProfileId").notNull(),
  participantProfileId: int("participantProfileId"),
  kind: mysqlEnum("kind", ["assistant", "individual"]).default("assistant").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("conversations_owner_idx").on(table.ownerProfileId)]);

export const messages = mysqlTable("messages", {
  id: varchar("id", { length: 32 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 32 }).notNull(),
  sender: mysqlEnum("sender", ["user", "assistant", "system", "teacher", "student"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("messages_conversation_idx").on(table.conversationId)]);

export const aiMaterials = mysqlTable("ai_materials", {
  id: varchar("id", { length: 32 }).primaryKey(),
  teacherProfileId: int("teacherProfileId").notNull(),
  prompt: text("prompt").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  lessonPlan: text("lessonPlan").notNull(),
  quiz: text("quiz").notNull(),
  slidesJson: text("slidesJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("materials_teacher_idx").on(table.teacherProfileId)]);

export const teacherStudentLinks = mysqlTable("teacher_student_links", {
  id: int("id").autoincrement().primaryKey(),
  teacherProfileId: int("teacherProfileId").notNull(),
  studentProfileId: int("studentProfileId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("teacher_student_unique").on(table.teacherProfileId, table.studentProfileId),
  index("teacher_student_teacher_idx").on(table.teacherProfileId),
]);

export const assignments = mysqlTable("assignments", {
  id: varchar("id", { length: 32 }).primaryKey(),
  teacherProfileId: int("teacherProfileId").notNull(),
  studentProfileId: int("studentProfileId").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  instructions: text("instructions").notNull(),
  status: mysqlEnum("status", ["assigned", "submitted", "reviewed", "completed"]).default("assigned").notNull(),
  dueAt: timestamp("dueAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("assignments_student_idx").on(table.studentProfileId)]);

export const submissions = mysqlTable("submissions", {
  id: varchar("id", { length: 32 }).primaryKey(),
  assignmentId: varchar("assignmentId", { length: 32 }).notNull(),
  studentProfileId: int("studentProfileId").notNull(),
  response: text("response").notNull(),
  score: int("score"),
  feedback: text("feedback"),
  status: mysqlEnum("submissionStatus", ["submitted", "reviewed"]).default("submitted").notNull(),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
}, table => [index("submissions_assignment_idx").on(table.assignmentId)]);

export const teacherSources = mysqlTable("teacher_sources", {
  id: varchar("id", { length: 32 }).primaryKey(),
  teacherProfileId: int("teacherProfileId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  storageKey: text("storageKey").notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  extractedText: text("extractedText"),
  status: mysqlEnum("sourceStatus", ["ready", "archived", "error"]).default("ready").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("teacher_sources_teacher_idx").on(table.teacherProfileId), index("teacher_sources_status_idx").on(table.status)]);

export const teacherAiSettings = mysqlTable("teacher_ai_settings", {
  teacherProfileId: int("teacherProfileId").primaryKey(),
  mode: mysqlEnum("mode", ["web", "local"]).default("web").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const subscriptionReceipts = mysqlTable("subscription_receipts", {
  id: varchar("id", { length: 32 }).primaryKey(),
  profileId: int("profileId").notNull(),
  fileName: varchar("fileName", { length: 256 }).notNull(),
  storageKey: text("storageKey").notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull().unique(),
  status: mysqlEnum("receiptStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
  parsedAmount: int("parsedAmount"),
  parsedCurrency: varchar("parsedCurrency", { length: 16 }),
  confidence: int("confidence"),
  analysisReason: text("analysisReason"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("subscription_receipts_profile_idx").on(table.profileId), index("subscription_receipts_status_idx").on(table.status)]);

export const subscriptions = mysqlTable("subscriptions", {
  id: varchar("id", { length: 32 }).primaryKey(),
  profileId: int("profileId").notNull(),
  plan: mysqlEnum("subscriptionPlan", ["individual", "enterprise"]).notNull(),
  status: mysqlEnum("subscriptionStatus", ["active", "expired", "cancelled"]).default("active").notNull(),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 16 }).default("UZS").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  receiptId: varchar("receiptId", { length: 32 }).unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("subscriptions_profile_idx").on(table.profileId), index("subscriptions_active_idx").on(table.profileId, table.status, table.endsAt)]);

export const groupSessions = mysqlTable("group_sessions", {
  id: varchar("id", { length: 32 }).primaryKey(),
  teacherProfileId: int("teacherProfileId").notNull(),
  telegramGroupId: varchar("telegramGroupId", { length: 64 }).notNull(),
  groupTitle: varchar("groupTitle", { length: 256 }).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  topic: text("topic").notNull(),
  aiMode: mysqlEnum("aiMode", ["web", "local"]).default("web").notNull(),
  sourceIdsJson: text("sourceIdsJson"),
  lessonBriefJson: text("lessonBriefJson"),
  status: mysqlEnum("sessionStatus", ["planned", "live", "paused", "ended"]).default("planned").notNull(),
  startedAt: timestamp("startedAt"),
  endedAt: timestamp("endedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("sessions_teacher_idx").on(table.teacherProfileId)]);

export const sessionParticipants = mysqlTable("session_participants", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 32 }).notNull(),
  profileId: int("profileId").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, table => [uniqueIndex("session_participant_unique").on(table.sessionId, table.profileId)]);

export const sessionQuestions = mysqlTable("session_questions", {
  id: varchar("id", { length: 32 }).primaryKey(),
  sessionId: varchar("sessionId", { length: 32 }).notNull(),
  question: text("question").notNull(),
  optionsJson: text("optionsJson").notNull(),
  correctOption: int("correctOption"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("questions_session_idx").on(table.sessionId)]);

export const telegramGroupMembers = mysqlTable("telegram_group_members", {
  id: int("id").autoincrement().primaryKey(),
  telegramGroupId: varchar("telegramGroupId", { length: 64 }).notNull(),
  profileId: int("profileId").notNull(),
  status: mysqlEnum("memberStatus", ["member", "restricted", "administrator", "creator", "left", "kicked"]).notNull().default("member"),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
}, table => [uniqueIndex("telegram_group_member_unique").on(table.telegramGroupId, table.profileId), index("telegram_group_member_group_idx").on(table.telegramGroupId)]);

export const telegramProcessedUpdates = mysqlTable("telegram_processed_updates", {
  updateId: varchar("updateId", { length: 64 }).primaryKey(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
});

export const telegramGroupAnalysisRateLimits = mysqlTable("telegram_group_analysis_rate_limits", {
  rateKey: varchar("rateKey", { length: 160 }).primaryKey(),
  windowStartedAt: timestamp("windowStartedAt").notNull(),
  requestCount: int("requestCount").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const groupSessionEvents = mysqlTable("group_session_events", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 32 }).notNull(),
  profileId: int("profileId").notNull(),
  telegramUserId: varchar("telegramUserId", { length: 64 }).notNull(),
  eventType: mysqlEnum("eventType", ["join", "message", "question", "answer", "system"]).notNull(),
  content: text("content").notNull(),
  eventKey: varchar("eventKey", { length: 128 }),
  analysisJson: text("analysisJson"),
  replyToMessageId: varchar("replyToMessageId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("group_events_session_idx").on(table.sessionId), index("group_events_profile_idx").on(table.profileId), uniqueIndex("group_events_key_unique").on(table.eventKey)]);

export const sessionAnswers = mysqlTable("session_answers", {
  id: int("id").autoincrement().primaryKey(),
  questionId: varchar("questionId", { length: 32 }).notNull(),
  profileId: int("profileId").notNull(),
  answerIndex: int("answerIndex").notNull(),
  isCorrect: boolean("isCorrect"),
  answeredAt: timestamp("answeredAt").defaultNow().notNull(),
}, table => [uniqueIndex("session_answer_unique").on(table.questionId, table.profileId)]);

export const notifications = mysqlTable("notifications", {
  id: varchar("id", { length: 32 }).primaryKey(),
  profileId: int("profileId").notNull(),
  type: mysqlEnum("notificationType", ["assignment", "session", "general"]).notNull(),
  body: text("body").notNull(),
  deliveryStatus: mysqlEnum("deliveryStatus", ["queued", "sent", "failed"]).default("queued").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  sentAt: timestamp("sentAt"),
}, table => [index("notifications_profile_idx").on(table.profileId)]);

export const teacherInvites = mysqlTable("teacher_invites", {
  id: varchar("id", { length: 32 }).primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  createdByUserId: int("createdByUserId").notNull(),
  usedByProfileId: int("usedByProfileId"),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("teacher_invites_code_idx").on(table.code)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
