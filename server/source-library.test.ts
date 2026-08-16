import { describe, expect, it } from "vitest";
import { extractSourceText, isSupportedSourceType, modeInstruction, safeSourceName, sourcePromptContext, validateSourceUpload, MAX_SOURCE_BYTES } from "./sourceLibrary";

describe("teacher source library", () => {
  it("normalizes unsafe file names without losing the extension", () => {
    expect(safeSourceName("Biology textbook 2026!!.pdf")).toBe("Biology-textbook-2026.pdf");
  });

  it("extracts and bounds plain text source content", async () => {
    await expect(extractSourceText(Buffer.from("Photosynthesis converts light into chemical energy."), "text/plain", "lesson.txt")).resolves.toContain("Photosynthesis");
  });

  it("accepts supported teaching files and rejects unsupported files", () => {
    expect(isSupportedSourceType("application/pdf", "book.pdf")).toBe(true);
    expect(isSupportedSourceType("application/octet-stream", "archive.zip")).toBe(false);
  });

  it("validates upload type and size limits before extraction", () => {
    expect(validateSourceUpload({ filename: "lesson.pdf", mimeType: "application/pdf", sizeBytes: 1024 })).toBeNull();
    expect(validateSourceUpload({ filename: "lesson.zip", mimeType: "application/zip", sizeBytes: 1024 })?.status).toBe(415);
    expect(validateSourceUpload({ filename: "lesson.pdf", mimeType: "application/pdf", sizeBytes: MAX_SOURCE_BYTES + 1 })?.status).toBe(413);
  });

  it("makes local mode source boundaries explicit", () => {
    expect(modeInstruction("local")).toContain("only the attached teacher sources");
    expect(sourcePromptContext([{ name: "book.txt", mimeType: "text/plain", extractedText: "A trusted definition" }])).toContain("book.txt");
  });
});
