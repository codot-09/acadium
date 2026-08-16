import type { Request, Response } from "express";
import { createTeacherSource, upsertTelegramProfile } from "./db";
import { storagePut } from "./storage";
import { verifyTelegramInitData } from "./telegram";
import { extractSourceText, MAX_SOURCE_BYTES, safeSourceName, validateSourceUpload } from "./sourceLibrary";

type UploadProfile = { id: number; role: string };
type UploadDeps = {
  verify: typeof verifyTelegramInitData;
  upsertProfile: typeof upsertTelegramProfile;
  put: typeof storagePut;
  createSource: typeof createTeacherSource;
  extract: typeof extractSourceText;
};

const defaultDeps: UploadDeps = { verify: verifyTelegramInitData, upsertProfile: upsertTelegramProfile, put: storagePut, createSource: createTeacherSource, extract: extractSourceText };

export function createSourceUploadHandler(overrides: Partial<UploadDeps> = {}) {
  const deps = { ...defaultDeps, ...overrides };
  return async (req: Request, res: Response) => {
    try {
      const initData = typeof req.body?.initData === "string" ? req.body.initData.trim() : "";
      const filename = typeof req.body?.filename === "string" ? req.body.filename.trim() : "";
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim().toLowerCase() : "";
      const dataBase64 = typeof req.body?.dataBase64 === "string" ? req.body.dataBase64 : "";
      if (!initData || !filename || !mimeType || !dataBase64) return res.status(400).json({ error: "initData, filename, mimeType and dataBase64 are required" });
      const validation = validateSourceUpload({ filename, mimeType, sizeBytes: Math.floor(dataBase64.length * 0.75) });
      if (validation) return res.status(validation.status).json({ error: validation.error });
      if (dataBase64.length > Math.ceil(MAX_SOURCE_BYTES * 1.4)) return res.status(413).json({ error: "File is too large. Maximum size is 15 MB." });
      const identity = deps.verify(initData, process.env.TELEGRAM_BOT_TOKEN!);
      const profile = await deps.upsertProfile(identity) as UploadProfile;
      if (profile.role !== "teacher") return res.status(403).json({ error: "Teacher access is required" });
      const buffer = Buffer.from(dataBase64, "base64");
      if (buffer.byteLength > MAX_SOURCE_BYTES) return res.status(413).json({ error: "File is too large. Maximum size is 15 MB." });
      const extractedText = await deps.extract(buffer, mimeType, filename);
      if (!extractedText) return res.status(422).json({ error: "The file does not contain readable text." });
      const stored = await deps.put(`teacher-sources/${profile.id}/${safeSourceName(filename)}`, buffer, mimeType);
      const source = await deps.createSource({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 32), teacherProfileId: profile.id, name: filename.slice(0, 256), storageKey: stored.key, mimeType, sizeBytes: buffer.byteLength, extractedText });
      return res.status(201).json({ source: { ...source, extractedText: undefined } });
    } catch (error) {
      console.error("[Teacher source upload] failed", error);
      return res.status(500).json({ error: error instanceof Error ? error.message : "Source upload failed" });
    }
  };
}
