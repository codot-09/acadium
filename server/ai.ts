import { invokeLLM } from "./_core/llm";
import { modeInstruction, sourcePromptContext, type SourceMode, type SourceRecord } from "./sourceLibrary";

export type GeneratedMaterial = { title: string; lessonPlan: string; quiz: string; slides: Array<{ title: string; content: string; imageDescription: string }> };
export type GroupLessonBrief = { title: string; overview: string; objectives: string[]; keyPoints: string[]; resources: Array<{ title: string; summary: string; searchQuery: string }>; firstQuestion: string };
export type GroupResponseAnalysis = { classification: "answer" | "question" | "off_topic"; reply: string; confidence: number; needsTeacher: boolean; suggestedNextStep: string };
export type SourceGroundingContext = { mode: SourceMode; sources?: SourceRecord[] };

function groundingPrompt(context?: SourceGroundingContext) {
  if (!context) return { instruction: modeInstruction("web"), sources: "" };
  return { instruction: modeInstruction(context.mode), sources: context.mode === "local" ? sourcePromptContext(context.sources ?? []) : "" };
}

function contentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(part => typeof part === "object" && part && "text" in part && typeof part.text === "string" ? part.text : "").join("");
  return "";
}

const groupLessonBriefSchema = { type: "object", properties: { title: { type: "string" }, overview: { type: "string" }, objectives: { type: "array", items: { type: "string" } }, keyPoints: { type: "array", items: { type: "string" } }, resources: { type: "array", items: { type: "object", properties: { title: { type: "string" }, summary: { type: "string" }, searchQuery: { type: "string" } }, required: ["title", "summary", "searchQuery"], additionalProperties: false } }, firstQuestion: { type: "string" } }, required: ["title", "overview", "objectives", "keyPoints", "resources", "firstQuestion"], additionalProperties: false };
const groupResponseAnalysisSchema = { type: "object", properties: { classification: { type: "string", enum: ["answer", "question", "off_topic"] }, reply: { type: "string" }, confidence: { type: "number" }, needsTeacher: { type: "boolean" }, suggestedNextStep: { type: "string" } }, required: ["classification", "reply", "confidence", "needsTeacher", "suggestedNextStep"], additionalProperties: false };

function fallbackGroupLessonBrief(topic: string, context?: SourceGroundingContext): GroupLessonBrief {
  const cleanTopic = topic.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ").slice(0, 120) || "Umumiy mavzu";
  return {
    title: cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1),
    overview: `Bugungi online lesson mavzusi: ${cleanTopic}. Avval asosiy tushunchalarni aniqlaymiz, keyin misol va kichik amaliy topshiriq orqali mustahkamlaymiz.`,
    objectives: [`${cleanTopic} bo‘yicha asosiy tushunchalarni izohlash`, "Mavzuni oddiy misol bilan tushuntirish", "Savol-javob orqali tushunishni tekshirish"],
    keyPoints: ["Asosiy atamalar va ularning ma’nosi", "Mavzuning real hayotdagi qo‘llanilishi", "O‘quvchi javobini dalil yoki misol bilan asoslash"],
    resources: [{ title: context?.mode === "local" ? "Biriktirilgan teacher manbalari" : "Qidiruv uchun yo‘nalish", summary: context?.mode === "local" ? "Bu lesson teacher dashboardda biriktirilgan manbalar asosida tayyorlandi." : "Mavzu bo‘yicha ishonchli darslik, ensiklopediya yoki maktab manbasini tanlang.", searchQuery: context?.mode === "local" ? "" : cleanTopic }],
    firstQuestion: `${cleanTopic} haqida bilgan eng muhim fikringiz nima? Misol bilan yozing.`,
  };
}

function parseGroupLessonBrief(raw: unknown): GroupLessonBrief {
  if (typeof raw !== "string") throw new Error("Group lesson brief response is empty");
  const parsed = JSON.parse(raw) as GroupLessonBrief;
  if (!parsed.title || !parsed.overview || !parsed.firstQuestion || !Array.isArray(parsed.objectives) || !Array.isArray(parsed.keyPoints) || !Array.isArray(parsed.resources)) throw new Error("Group lesson brief is incomplete");
  return parsed;
}

export async function generateGroupLessonBrief(topic: string, context?: SourceGroundingContext): Promise<GroupLessonBrief> {
  const grounding = groundingPrompt(context);
  try {
    const result = await invokeLLM({ model: "gpt-5-mini", maxTokens: 2400, messages: [
      { role: "system", content: `You are Acadium, an online teacher for a Telegram class. Respond in Uzbek. Return compact valid JSON matching the schema. Create a concise, age-neutral lesson starter. ${grounding.instruction} Do not invent direct URLs; in WEB mode provide safe resource search queries. In LOCAL mode keep resources tied to the attached sources and do not fabricate citations. Make the group ready to discuss.` },
      { role: "user", content: `Create a compact group lesson brief for this topic: ${topic.trim().slice(0, 160)}${grounding.sources ? `\n\nAttached teacher sources:\n${grounding.sources}` : ""}` },
    ], response_format: { type: "json_schema", json_schema: { name: "acadium_group_lesson_brief", strict: true, schema: groupLessonBriefSchema } } });
    return parseGroupLessonBrief(result.choices[0]?.message.content);
  } catch (error) {
    console.error("[AI] Group lesson brief failed; using safe starter fallback", error);
    return fallbackGroupLessonBrief(topic, context);
  }
}

function fallbackGroupResponseAnalysis(message: string, replyContext?: string): GroupResponseAnalysis {
  const isQuestion = message.trim().endsWith("?") || /^(nima|nega|qanday|qachon|kim|where|why|how|what)\b/i.test(message.trim());
  return { classification: isQuestion ? "question" : "answer", reply: replyContext ? "Reply qilingan Acadium dars xabari kontekstida javobingiz qabul qilindi. Asosiy fikringizni yana bir misol yoki dalil bilan mustahkamlang." : "Javobingiz qabul qilindi. Asosiy fikringizni yana bir misol yoki dalil bilan mustahkamlang.", confidence: 0.35, needsTeacher: true, suggestedNextStep: "Javobni misol bilan kengaytiring; teacher Analyze menyusida ko‘rib chiqishi mumkin." };
}

export async function analyzeGroupMessage(topic: string, brief: GroupLessonBrief | null, message: string, replyContext?: string, context?: SourceGroundingContext): Promise<GroupResponseAnalysis> {
  const grounding = groundingPrompt(context);
  try {
    const result = await invokeLLM({ model: "gpt-5-mini", maxTokens: 1200, messages: [
      { role: "system", content: `You are Acadium, a calm online teacher assistant inside a Telegram group. Respond in Uzbek. Analyze the student message against the lesson topic and the quoted Telegram message when provided. If it is a question, answer clearly. If it is an answer, give concise feedback and one next step. Never shame a student. Set needsTeacher true only when the teacher should personally follow up. ${grounding.instruction}` },
      { role: "user", content: JSON.stringify({ topic, lesson: brief, attachedTeacherSources: grounding.sources || null, quotedTelegramMessage: replyContext?.slice(0, 4000) ?? null, studentMessage: message }) },
    ], response_format: { type: "json_schema", json_schema: { name: "acadium_group_response_analysis", strict: true, schema: groupResponseAnalysisSchema } } });
    const raw = contentToText(result.choices[0]?.message.content);
    if (!raw) throw new Error("Group response analysis is empty");
    const parsed = JSON.parse(raw) as GroupResponseAnalysis;
    if (!parsed.reply || !parsed.classification || typeof parsed.confidence !== "number") throw new Error("Group response analysis is incomplete");
    return { ...parsed, confidence: Math.max(0, Math.min(1, parsed.confidence)) };
  } catch (error) {
    console.error("[AI] Group response analysis failed; using safe response", error);
    return fallbackGroupResponseAnalysis(message, replyContext);
  }
}

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
