import { describe, expect, it, vi } from "vitest";

const llmMocks = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/llm", () => llmMocks);

import { generateGroupLessonBrief } from "./ai";

describe("group lesson brief generation", () => {
  it("returns a validated LLM brief when the provider returns valid JSON", async () => {
    llmMocks.invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ title: "Fotosintez", overview: "Overview", objectives: ["Understand"], keyPoints: ["Light"], resources: [{ title: "Textbook", summary: "Read the chapter", searchQuery: "fotosintez 8 sinf" }], firstQuestion: "Nima uchun yorug‘lik kerak?" }) } }] });
    const brief = await generateGroupLessonBrief("fotosintez-8-sinf");
    expect(brief.title).toBe("Fotosintez");
    expect(brief.resources[0]?.searchQuery).toContain("fotosintez");
  });

  it("starts a usable lesson with a safe fallback when JSON is truncated", async () => {
    llmMocks.invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: '{"title":"Fotosintez","overview":"unfinished' } }] });
    const brief = await generateGroupLessonBrief("fotosintez-8-sinf");
    expect(brief.title).toBe("Fotosintez 8 sinf");
    expect(brief.objectives.length).toBeGreaterThan(0);
    expect(brief.firstQuestion).toContain("fotosintez 8 sinf");
  });

  it("starts a usable lesson when the LLM provider is unavailable", async () => {
    llmMocks.invokeLLM.mockRejectedValueOnce(new Error("provider unavailable"));
    const brief = await generateGroupLessonBrief("algebra");
    expect(brief.title).toBe("Algebra");
    expect(brief.resources).toHaveLength(1);
  });
});
