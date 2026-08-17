import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createAssignment,
  createGroupSession,
  createTeacherInvite,
  getOrCreateIndividualConversation,
  submitAssignment,
  redeemTeacherInvite,
  getConversationMessages,
  getConversationById,
  createAssistantConversation,
  deleteConversationForOwner,
  getOrCreateAssistantConversation,
  getUserConversations,
  getStudentDashboard,
  getStudentSubmissionsForTeacher,
  getTeacherAnalytics,
  getTeacherDashboard,
  getTeacherGroupSessionDetail,
  getTeacherGroupSessions,
  updateTeacherGroupSessionStatus,
  getTelegramProfileById,
  getTeacherSources,
  getTeacherAiMode,
  setTeacherAiMode,
  archiveTeacherSource,
  saveMessage,
  setTelegramProfileRole,
  upsertTelegramProfile,
  getSubscriptionStatus,
} from "./db";
import { verifyTelegramInitData } from "./telegram";
import { CLICK_PAYMENT_URL, ENTERPRISE_CONTACT, INDIVIDUAL_PRICE_UZS } from "./subscriptions";

const telegramInput = z.object({ initData: z.string().min(1) });

async function getTelegramProfile(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Telegram bot token is not configured" });
  }
  try {
    const identity = verifyTelegramInitData(initData, botToken);
    const profile = await upsertTelegramProfile(identity);
    if (!profile) throw new Error("Profile was not created");
    return profile;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "Telegram verification failed" });
  }
}

async function requireTeacher(initData: string) {
  const profile = await getTelegramProfile(initData);
  if (profile.role !== "teacher") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Teacher access is required" });
  }
  return profile;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  telegram: router({
    bootstrap: publicProcedure.input(telegramInput).mutation(({ input }) => getTelegramProfile(input.initData)),
    redeemTeacherInvite: publicProcedure.input(telegramInput.extend({ inviteCode: z.string().trim().min(5).max(64) })).mutation(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      const redeemed = await redeemTeacherInvite(input.inviteCode, profile.id);
      if (!redeemed) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite is invalid or expired" });
      return { ...(await getTelegramProfile(input.initData))!, role: "teacher" as const };
    }),
    selectRole: publicProcedure.input(telegramInput.extend({ role: z.enum(["teacher", "student"]) })).mutation(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      if (input.role === "teacher" && profile.role !== "teacher") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Teacher role must be assigned by an administrator" });
      }
      return setTelegramProfileRole(profile.id, input.role);
    }),
    dashboard: publicProcedure.input(telegramInput).query(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      const conversation = await getOrCreateAssistantConversation(profile.id);
      const [history, dashboard] = await Promise.all([
        getConversationMessages(conversation.id),
        profile.role === "teacher" ? getTeacherDashboard(profile.id) : getStudentDashboard(profile.id),
      ]);
      return { profile, conversation, history, dashboard };
    }),
    analytics: publicProcedure.input(telegramInput).query(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      if (profile.role !== "teacher") throw new TRPCError({ code: "FORBIDDEN", message: "Teacher analytics access is required" });
      return getTeacherAnalytics(profile.id);
    }),
  }),
  subscription: router({
    status: publicProcedure.input(telegramInput).query(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      return { profile: { id: profile.id, role: profile.role }, ...await getSubscriptionStatus(profile.id), individualPrice: INDIVIDUAL_PRICE_UZS, currency: "UZS", clickPaymentUrl: CLICK_PAYMENT_URL, enterpriseContact: ENTERPRISE_CONTACT };
    }),
  }),
  chat: router({
    conversations: publicProcedure.input(telegramInput).query(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      return getUserConversations(profile.id);
    }),
    newConversation: publicProcedure.input(telegramInput.extend({ title: z.string().trim().min(1).max(120).optional() })).mutation(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      return createAssistantConversation(profile.id, input.title ?? "New chat");
    }),
    deleteConversation: publicProcedure.input(telegramInput.extend({ conversationId: z.string().min(1) })).mutation(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      const deleted = await deleteConversationForOwner(profile.id, input.conversationId);
      if (!deleted) throw new TRPCError({ code: "FORBIDDEN", message: "Conversation access denied" });
      return { success: true as const, conversationId: input.conversationId };
    }),
    history: publicProcedure.input(telegramInput).query(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      const conversation = await getOrCreateAssistantConversation(profile.id);
      return { conversation, messages: await getConversationMessages(conversation.id) };
    }),
    thread: publicProcedure.input(telegramInput.extend({ conversationId: z.string().min(1) })).query(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.ownerProfileId !== profile.id) throw new TRPCError({ code: "FORBIDDEN", message: "Conversation access denied" });
      return { conversation, messages: await getConversationMessages(conversation.id) };
    }),
    saveUserMessage: publicProcedure.input(telegramInput.extend({ content: z.string().trim().min(1).max(12_000) })).mutation(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      const conversation = await getOrCreateAssistantConversation(profile.id);
      return saveMessage(conversation.id, "user", input.content);
    }),
    saveMessageToConversation: publicProcedure.input(telegramInput.extend({ conversationId: z.string().min(1), content: z.string().trim().min(1).max(12_000) })).mutation(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.ownerProfileId !== profile.id) throw new TRPCError({ code: "FORBIDDEN", message: "Conversation access denied" });
      return saveMessage(conversation.id, "user", input.content);
    }),
    saveAssistantMessage: publicProcedure.input(telegramInput.extend({ content: z.string().trim().min(1).max(20_000) })).mutation(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      const conversation = await getOrCreateAssistantConversation(profile.id);
      return saveMessage(conversation.id, "assistant", input.content);
    }),
    individualHistory: publicProcedure.input(telegramInput.extend({ conversationId: z.string().min(1) })).query(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || (conversation.ownerProfileId !== profile.id && conversation.participantProfileId !== profile.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Conversation access denied" });
      return getConversationMessages(input.conversationId);
    }),
    sendIndividualMessage: publicProcedure.input(telegramInput.extend({ conversationId: z.string().min(1), content: z.string().trim().min(1).max(12_000) })).mutation(async ({ input }) => {
      const profile = await getTelegramProfile(input.initData);
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || (conversation.ownerProfileId !== profile.id && conversation.participantProfileId !== profile.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Conversation access denied" });
      return saveMessage(input.conversationId, profile.role === "teacher" ? "teacher" : "student", input.content);
    }),
  }),
  student: router({
    submitAssignment: publicProcedure.input(telegramInput.extend({ assignmentId: z.string().min(1), response: z.string().trim().min(1).max(20_000) })).mutation(async ({ input }) => {
      const student = await getTelegramProfile(input.initData);
      if (student.role !== "student") throw new TRPCError({ code: "FORBIDDEN", message: "Student access is required" });
      return submitAssignment({ assignmentId: input.assignmentId, studentProfileId: student.id, response: input.response });
    }),
  }),
  teacher: router({
    createInvite: protectedProcedure.input(z.object({ expiresInDays: z.number().int().min(1).max(30).default(7) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access is required" });
      return createTeacherInvite(ctx.user.id, input.expiresInDays);
    }),
    openStudentChat: publicProcedure.input(telegramInput.extend({ studentProfileId: z.number().int().positive() })).mutation(async ({ input }) => {
      const teacher = await requireTeacher(input.initData);
      const student = await getTelegramProfileById(input.studentProfileId);
      if (!student || student.role !== "student") throw new TRPCError({ code: "BAD_REQUEST", message: "Student profile is invalid" });
      return getOrCreateIndividualConversation(teacher.id, student.id);
    }),
    startGroupSession: publicProcedure.input(telegramInput.extend({ telegramGroupId: z.string().min(1), groupTitle: z.string().min(1), title: z.string().min(3), topic: z.string().min(3) })).mutation(async ({ input }) => {
      const teacher = await requireTeacher(input.initData);
      const subscription = await getSubscriptionStatus(teacher.id);
      if (!subscription.canStartSession) throw new TRPCError({ code: "FORBIDDEN", message: "The free 3-session limit is used. Activate an Individual subscription to continue." });
      return createGroupSession({ teacherProfileId: teacher.id, telegramGroupId: input.telegramGroupId, groupTitle: input.groupTitle, title: input.title, topic: input.topic });
    }),
    sessions: publicProcedure.input(telegramInput).query(async ({ input }) => {
      const teacher = await requireTeacher(input.initData);
      return getTeacherGroupSessions(teacher.id);
    }),
    sources: publicProcedure.input(telegramInput).query(async ({ input }) => {
      const teacher = await requireTeacher(input.initData);
      return getTeacherSources(teacher.id);
    }),
    aiSettings: publicProcedure.input(telegramInput).query(async ({ input }) => {
      const teacher = await requireTeacher(input.initData);
      return { mode: await getTeacherAiMode(teacher.id) };
    }),
    setAiMode: publicProcedure.input(telegramInput.extend({ mode: z.enum(["web", "local"]) })).mutation(async ({ input }) => {
      const teacher = await requireTeacher(input.initData);
      return setTeacherAiMode(teacher.id, input.mode);
    }),
    archiveSource: publicProcedure.input(telegramInput.extend({ sourceId: z.string().min(1) })).mutation(async ({ input }) => {
      const teacher = await requireTeacher(input.initData);
      await archiveTeacherSource(teacher.id, input.sourceId);
      return { success: true as const };
    }),
    sessionDetail: publicProcedure.input(telegramInput.extend({ sessionId: z.string().min(1) })).query(async ({ input }) => {
      const teacher = await requireTeacher(input.initData);
      return getTeacherGroupSessionDetail(teacher.id, input.sessionId);
    }),
    updateSessionStatus: publicProcedure.input(telegramInput.extend({ sessionId: z.string().min(1), status: z.enum(["live", "paused", "ended"]) })).mutation(async ({ input }) => {
      const teacher = await requireTeacher(input.initData);
      const updated = await updateTeacherGroupSessionStatus(teacher.id, input.sessionId, input.status);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      return updated;
    }),
    studentResults: publicProcedure.input(telegramInput.extend({ studentProfileId: z.number().int().positive() })).query(async ({ input }) => {
      const teacher = await requireTeacher(input.initData);
      return getStudentSubmissionsForTeacher(teacher.id, input.studentProfileId);
    }),
    assignTask: publicProcedure.input(telegramInput.extend({
      studentProfileId: z.number().int().positive(),
      title: z.string().trim().min(3).max(256),
      instructions: z.string().trim().min(3).max(10_000),
      dueAt: z.date().optional(),
    })).mutation(async ({ input }) => {
      const teacher = await requireTeacher(input.initData);
      const student = await getTelegramProfileById(input.studentProfileId);
      if (!student || student.role !== "student") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Student profile is invalid" });
      }
      return createAssignment({
        teacherProfileId: teacher.id,
        studentProfileId: input.studentProfileId,
        title: input.title,
        instructions: input.instructions,
        dueAt: input.dueAt,
      });
    }),
  }),
});

export type AppRouter = typeof appRouter;
