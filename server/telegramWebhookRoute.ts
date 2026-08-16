import express, { type Express } from "express";
import { processTelegramWebhookRequest } from "./telegramWebhook";

export function createTelegramWebhookApp(input: { expectedSecret: string | undefined; claim: (updateId: number) => Promise<boolean>; handle: (body: unknown) => Promise<void> }): Express {
  const app = express();
  app.use(express.json());
  app.post("/api/telegram/webhook", async (req, res) => {
    const status = await processTelegramWebhookRequest({
      suppliedSecret: req.header("x-telegram-bot-api-secret-token"),
      expectedSecret: input.expectedSecret,
      updateId: req.body?.update_id,
      body: req.body,
      claim: input.claim,
      handle: input.handle,
    });
    res.sendStatus(status);
  });
  return app;
}
