import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { createSubscriptionReceipt, activateIndividualSubscription, updateSubscriptionReceiptAnalysis, upsertTelegramProfile } from "./db";
import { storagePut } from "./storage";
import { verifyTelegramInitData } from "./telegram";
import { analyzeIndividualReceipt, INDIVIDUAL_PRICE_UZS } from "./subscriptions";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const RECEIPT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export function createSubscriptionReceiptUploadHandler(overrides: Partial<{
  verify: typeof verifyTelegramInitData;
  upsertProfile: typeof upsertTelegramProfile;
  put: typeof storagePut;
  createReceipt: typeof createSubscriptionReceipt;
  analyze: typeof analyzeIndividualReceipt;
  updateReceipt: typeof updateSubscriptionReceiptAnalysis;
  activate: typeof activateIndividualSubscription;
}> = {}) {
  const deps = { verify: verifyTelegramInitData, upsertProfile: upsertTelegramProfile, put: storagePut, createReceipt: createSubscriptionReceipt, analyze: analyzeIndividualReceipt, updateReceipt: updateSubscriptionReceiptAnalysis, activate: activateIndividualSubscription, ...overrides };
  return async (req: Request, res: Response) => {
    try {
      const initData = typeof req.body?.initData === "string" ? req.body.initData.trim() : "";
      const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim().toLowerCase() : "";
      const dataBase64 = typeof req.body?.dataBase64 === "string" ? req.body.dataBase64 : "";
      if (!initData || !fileName || !mimeType || !dataBase64) return res.status(400).json({ error: "initData, fileName, mimeType and dataBase64 are required" });
      if (!RECEIPT_TYPES.has(mimeType)) return res.status(415).json({ error: "Upload a PDF, JPG, PNG or WEBP payment receipt." });
      if (dataBase64.length > Math.ceil(MAX_RECEIPT_BYTES * 1.4)) return res.status(413).json({ error: "Receipt is too large. Maximum size is 10 MB." });
      const identity = deps.verify(initData, process.env.TELEGRAM_BOT_TOKEN!);
      const profile = await deps.upsertProfile(identity);
      if (profile.role !== "teacher") return res.status(403).json({ error: "Teacher access is required" });
      const buffer = Buffer.from(dataBase64, "base64");
      if (buffer.byteLength > MAX_RECEIPT_BYTES) return res.status(413).json({ error: "Receipt is too large. Maximum size is 10 MB." });
      const fingerprint = createHash("sha256").update(buffer).digest("hex");
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
      const stored = await deps.put(`subscription-receipts/${profile.id}/${id}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 180)}`, buffer, mimeType);
      try {
        await deps.createReceipt({ id, profileId: profile.id, fileName: fileName.slice(0, 256), storageKey: stored.key, mimeType, sizeBytes: buffer.byteLength, fingerprint });
      } catch {
        return res.status(409).json({ error: "This receipt has already been submitted." });
      }
      try {
        const analysis = await deps.analyze({ url: stored.url, mimeType });
        const paidAt = analysis.paidAt ? new Date(analysis.paidAt) : undefined;
        const saved = await deps.updateReceipt({ id, status: analysis.approved ? "approved" : "pending", parsedAmount: analysis.amount, parsedCurrency: analysis.currency, confidence: analysis.confidence, analysisReason: analysis.reason, paymentStatus: analysis.paymentStatus, recipient: analysis.recipient, transactionId: analysis.transactionId, paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : undefined, evidence: analysis.evidence, fraudSignals: analysis.fraudSignals, analysisVersion: analysis.analysisVersion });
        const subscription = analysis.approved ? await deps.activate({ profileId: profile.id, receiptId: id, amount: INDIVIDUAL_PRICE_UZS }) : null;
        return res.status(201).json({ receipt: { ...saved, storageKey: undefined }, subscription, approved: analysis.approved, reviewRequired: !analysis.approved, message: analysis.approved ? "Receipt approved. Individual subscription is active." : "Receipt is queued for admin review. Subscription will activate after approval." });
      } catch (error) {
        await deps.updateReceipt({ id, status: "pending", confidence: 0, analysisReason: "Automatic verification failed; admin review is required.", paymentStatus: "unknown", fraudSignals: [error instanceof Error ? error.message : "Receipt analysis failed"], analysisVersion: "click-v2" });
        return res.status(422).json({ error: "Receipt could not be verified automatically. Please upload a clear Click payment receipt." });
      }
    } catch (error) {
      console.error("[Subscription receipt] failed", error);
      return res.status(500).json({ error: error instanceof Error ? error.message : "Receipt upload failed" });
    }
  };
}
