import { describe, expect, it, vi } from "vitest";
import { createSourceUploadHandler } from "./sourceUpload";

function responseMock() {
  const response = { statusCode: 200, body: undefined as unknown, status(code: number) { response.statusCode = code; return response; }, json(body: unknown) { response.body = body; return response; } };
  return response;
}

const baseRequest = { body: { initData: "signed-init-data", filename: "biology.txt", mimeType: "text/plain", dataBase64: Buffer.from("Photosynthesis uses light.").toString("base64") } } as never;

function depsFor(role: string) {
  return {
    verify: vi.fn(() => ({ user: { id: 7, first_name: "Teacher" }, authDate: 1, hash: "hash" })) as never,
    upsertProfile: vi.fn(async () => ({ id: 42, role })) as never,
    extract: vi.fn(async () => "Photosynthesis uses light.") as never,
    put: vi.fn(async () => ({ key: "teacher-sources/42/biology.txt", url: "https://storage.test/source" })) as never,
    createSource: vi.fn(async (input: unknown) => ({ ...(input as object), id: "source-1", createdAt: new Date() })) as never,
  };
}

describe("teacher source upload handler", () => {
  it("rejects a non-teacher after Telegram identity verification", async () => {
    const res = responseMock();
    await createSourceUploadHandler(depsFor("student"))(baseRequest, res as never);
    expect(res.statusCode).toBe(403);
  });

  it("rejects unsupported files before auth or storage work", async () => {
    const deps = depsFor("teacher");
    const req = { body: { ...baseRequest.body, filename: "archive.zip", mimeType: "application/zip" } } as never;
    const res = responseMock();
    await createSourceUploadHandler(deps)(req, res as never);
    expect(res.statusCode).toBe(415);
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it("rejects payloads over 15 MB", async () => {
    const deps = depsFor("teacher");
    const req = { body: { ...baseRequest.body, dataBase64: "A".repeat(21_000_001) } } as never;
    const res = responseMock();
    await createSourceUploadHandler(deps)(req, res as never);
    expect(res.statusCode).toBe(413);
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it("extracts, stores and persists a teacher source", async () => {
    const deps = depsFor("teacher");
    const res = responseMock();
    await createSourceUploadHandler(deps)(baseRequest, res as never);
    expect(res.statusCode).toBe(201);
    expect(deps.extract).toHaveBeenCalled();
    expect(deps.put).toHaveBeenCalledWith("teacher-sources/42/biology.txt", expect.any(Buffer), "text/plain");
    expect(deps.createSource).toHaveBeenCalledWith(expect.objectContaining({ teacherProfileId: 42, storageKey: "teacher-sources/42/biology.txt", extractedText: "Photosynthesis uses light." }));
  });
});
