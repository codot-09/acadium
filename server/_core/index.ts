import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { generateAcadiumResponse, generateStructuredMaterial, materialToMarkdown, streamText } from "../ai";
import { claimTelegramUpdate, getConversationById, saveAiMaterial, saveMessage, upsertTelegramProfile } from "../db";
import { verifyTelegramInitData } from "../telegram";
import { getTelegramInitData } from "../aiRequest";
import { registerTelegramWebhook } from "../telegramBot";
import type { TelegramUpdate } from "../telegramBot";
import { createTelegramWebhookApp } from "../telegramWebhookRoute";
import { createSourceUploadHandler } from "../sourceUpload";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/teacher/sources/upload", createSourceUploadHandler());
  app.post("/api/ai/stream", async (req, res) => {
    try {
      const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
      const role = req.body?.role === "student" ? "student" : "teacher";
      const conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId : "";
      if (!prompt) return res.status(400).json({ error: "prompt is required" });
      let answer: string; let profileId: number | undefined;
      const telegramInitData = getTelegramInitData(req.body?.initData, process.env.TELEGRAM_BOT_TOKEN);
      if (telegramInitData) {
        const identity = verifyTelegramInitData(telegramInitData, process.env.TELEGRAM_BOT_TOKEN!);
        const profile = await upsertTelegramProfile(identity);
        if (!profile) throw new Error("Telegram profile unavailable");
        profileId = profile.id;
        if (conversationId) {
          const conversation = await getConversationById(conversationId);
          if (!conversation || conversation.ownerProfileId !== profile.id) throw new Error("Conversation access denied");
        }
        if (role === "teacher") {
          const material = await generateStructuredMaterial(prompt);
          await saveAiMaterial({ teacherProfileId: profile.id, prompt, material });
          answer = materialToMarkdown(material);
        } else {
          answer = await generateAcadiumResponse(prompt, role);
        }
      } else {
        answer = await generateAcadiumResponse(prompt, role);
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      for await (const chunk of streamText(answer)) {
        if (res.writableEnded) break;
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      if (profileId && conversationId) await saveMessage(conversationId, "assistant", answer);
      res.write("data: [DONE]\\n\\n");
      res.end();
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : "AI generation failed" });
      else res.end();
    }
  });
  const telegramWebhookApp = createTelegramWebhookApp({ expectedSecret: process.env.TELEGRAM_WEBHOOK_SECRET, claim: claimTelegramUpdate, handle: async body => { const { handleTelegramUpdate } = await import("../telegramBot"); await handleTelegramUpdate(body as TelegramUpdate); } });
  app.use(telegramWebhookApp);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
    const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  registerTelegramWebhook().catch(error => console.error("[Telegram webhook] Registration failed:", error));
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
