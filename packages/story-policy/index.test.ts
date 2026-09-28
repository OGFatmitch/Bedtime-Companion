import { describe, expect, it } from "vitest";
import { validateStory } from ".";

const story = (fullText: string, ending = "Everyone felt safe, loved, and ready for sleep.") => ({
  fullText: `${fullText} ${ending}`,
  scenes: [{ text: "One" }, { text: "Two" }, { text: "Three" }, { text: ending }],
});

describe("story policy", () => {
  it("blocks unrequested butterflies", () => expect(validateStory(story("A butterfly arrived."), "cats").ok).toBe(false));
  it("allows explicitly requested butterflies", () => expect(validateStory(story("A butterfly arrived."), "a butterfly picnic").ok).toBe(true));
  it("requires a calm final scene", () => expect(validateStory(story("A gentle picnic.", "The end."), "picnic").ok).toBe(false));
});

