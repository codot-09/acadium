import { invokeLLM } from "./_core/llm";

export type GeneratedMaterial = { title: string; lessonPlan: string; quiz: string; slides: Array<{ title: string; content: string; imageDescription: string }> };

const materialSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    lessonPlan: { type: "string" },
    quiz: { type: "string" },
    slides: { type: "array", items: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, imageDescription: { type: "string" } }, required: ["title", "content", "imageDescription"], additionalProperties: false } },
  },
  required: ["title", "lessonPlan", "quiz", "slides"],
  additionalProperties: false,
};

export async function generateStructuredMaterial(prompt: string): Promise<GeneratedMaterial> {
  const result = await invokeLLM({ model: "gpt-5-mini", maxTokens: 3200, messages: [
    { role: "system", content: "You are Acadium, an expert instructional designer. Respond in Uzbek. Always produce a complete lesson plan, quiz, and presentation outline with 8-12 slides and image descriptions." },
    { role: "user", content: prompt },
  ], response_format: { type: "json_schema", json_schema: { name: "acadium_material", strict: true, schema: materialSchema } } });
  const raw = result.choices[0]?.message.content;
  if (typeof raw !== "string") throw new Error("Structured material response is empty");
  const parsed = JSON.parse(raw) as GeneratedMaterial;
  if (!parsed.title || !parsed.lessonPlan || !parsed.quiz || !Array.isArray(parsed.slides) || parsed.slides.length < 8) throw new Error("Generated material is incomplete");
  return parsed;
}

export function materialToMarkdown(material: GeneratedMaterial) {
  return `# ${material.title}\n\n## Lesson plan\n${material.lessonPlan}\n\n## Quiz\n${material.quiz}\n\n## Presentation outline\n${material.slides.map((slide, index) => `${index + 1}. **${slide.title}** — ${slide.content}\n   _Visual: ${slide.imageDescription}_`).join("\n")}`;
}

export async function generateAcadiumResponse(prompt: string, role: "teacher" | "student") {
  if (role === "teacher") {
    const material = await generateStructuredMaterial(prompt);
    return materialToMarkdown(material);
  }
  const result = await invokeLLM({ model: "gpt-5-mini", maxTokens: 2200, messages: [{ role: "system", content: "You are Acadium, a kind Socratic tutor. Respond in Uzbek when the user writes Uzbek. Explain clearly and give a short practice activity." }, { role: "user", content: prompt }] });
  const content = result.choices[0]?.message.content;
  return typeof content === "string" ? content : content.map(part => part.type === "text" ? part.text : "").join("");
}

export async function* streamText(text: string) {
  for (let index = 0; index < text.length; index += 8) { yield text.slice(index, index + 8); await new Promise(resolve => setTimeout(resolve, 12)); }
}
