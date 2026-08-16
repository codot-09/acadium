import { processTelegramUpdateOnce, verifyWebhookSecret } from "./telegramBot";

export async function processTelegramWebhookRequest(input: {
  suppliedSecret: string | undefined;
  expectedSecret: string | undefined;
  updateId?: number;
  body: unknown;
  claim: (updateId: number) => Promise<boolean>;
  handle: (body: unknown) => Promise<void>;
}) {
  if (!verifyWebhookSecret(input.suppliedSecret, input.expectedSecret)) return 401 as const;
  try {
    await processTelegramUpdateOnce(input.updateId, input.claim, () => input.handle(input.body));
    return 200 as const;
  } catch {
    return 200 as const;
  }
}
