import { invokeLLM } from "./_core/llm";

export async function generateAcadiumResponse(prompt: string, role: "teacher" | "student") {
  const system = role === "teacher"
    ? "You are Acadium, an expert instructional designer. Respond in Uzbek when the user writes Uzbek. Create practical, warm, rigorous teaching materials. When asked for a lesson, include lesson plan, quiz, and presentation outline with slide titles, content, and image descriptions. Use clear Markdown."
    : "You are Acadium, a kind Socratic tutor. Respond in Uzbek when the user writes Uzbek. Explain clearly, ask thoughtful questions, and give a short practice activity.";
  const result = await invokeLLM({ model: "gpt-5-mini", maxTokens: 2200, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] });
  const content = result.choices[0]?.message.content;
  return typeof content === "string" ? content : content.map(part => part.type === "text" ? part.text : "").join("");
}

export async function* streamText(text: string) {
  for (let index = 0; index < text.length; index += 8) {
    yield text.slice(index, index + 8);
    await new Promise(resolve => setTimeout(resolve, 12));
  }
}
