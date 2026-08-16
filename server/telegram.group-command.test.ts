import { describe, expect, it } from "vitest";
import { parseGroupCommand } from "./telegramBot";

describe("Telegram group lesson commands", () => {
  it("parses lesson slugs and bot mentions", () => {
    expect(parseGroupCommand("/lesson fotosintez-8-sinf")).toEqual({ command: "lesson", argument: "fotosintez-8-sinf" });
    expect(parseGroupCommand("/lesson@acadium_bot algebra")).toEqual({ command: "lesson", argument: "algebra" });
  });

  it("parses teacher ask and end commands", () => {
    expect(parseGroupCommand("/ask Fotosintezning bosqichi nima?")).toEqual({ command: "ask", argument: "Fotosintezning bosqichi nima?" });
    expect(parseGroupCommand("/endlesson")).toEqual({ command: "endlesson", argument: "" });
  });

  it("ignores ordinary text and unsupported commands", () => {
    expect(parseGroupCommand("hello class")).toBeNull();
    expect(parseGroupCommand("/unknown topic")).toBeNull();
  });
});
