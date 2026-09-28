export const STORY_POLICY_VERSION = "2026-09-28.v1";

export const storyPolicy = `
Write for a young child at bedtime. The story must be cozy, silly, warm, gentle, emotionally safe, and end calmly.
Do not include peril, abandonment, threats, villains, death, injury, weapons, frightening suspense, shaming, secrets from trusted adults, instructions to leave home, advertising, purchases, or claims that the device is a person or caregiver.
Use simple vocabulary, short sentences, playful repetition, gentle humor, and a quiet final section in which everyone is safe and loved.
Do not include butterflies unless the adult request explicitly asks for them.
`.trim();

type StoryLike = { scenes: Array<{ text: string }>; fullText: string };

const bannedPatterns: Array<[RegExp, string]> = [
  [/\b(kill|killed|death|dead|weapon|gun|knife)\b/i, "violent content"],
  [/\b(secret from (?:mom|dad|your parents?|grown-ups?))\b/i, "secrecy from trusted adults"],
  [/\b(run away|leave (?:the )?(?:house|home|bedroom))\b/i, "instructions to leave a safe place"],
];

export function validateStory(story: StoryLike, requestText = "") {
  const issues: string[] = [];
  if (story.scenes.length < 4 || story.scenes.length > 6) issues.push("Story must contain 4–6 scenes.");
  if (story.scenes.some((scene) => !scene.text.trim())) issues.push("Every scene needs narration text.");
  for (const [pattern, label] of bannedPatterns) if (pattern.test(story.fullText)) issues.push(`Story contains ${label}.`);
  if (/\bbutterfl(?:y|ies)\b/i.test(story.fullText) && !/\bbutterfl(?:y|ies)\b/i.test(requestText)) {
    issues.push("Butterflies require an explicit adult request.");
  }
  const ending = story.scenes.at(-1)?.text ?? "";
  if (!/\b(safe|cozy|calm|sleep|bed|rest|loved|goodnight)\b/i.test(ending)) issues.push("Final scene needs a calm bedtime landing.");
  return { ok: issues.length === 0, issues };
}

