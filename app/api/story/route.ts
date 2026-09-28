import { z } from "zod";
import { apiError, apiJson, requestId } from "@/lib/api";
import { logEvent, safeError } from "@/lib/logger";
import { generateStory } from "@/lib/openaiStory";
import { prisma } from "@/lib/prisma";
import { findUnsafe } from "@/lib/safety";

const requestSchema = z.object({
  childId: z.string().min(1),
  mode: z.string().min(1).max(100),
  prompt: z.string().max(1_000).default(""),
  tone: z.string().max(300).default(""),
  minutes: z.coerce.number().int().min(3).max(15),
});

export async function POST(request: Request) {
  const id = requestId(request);
  const startedAt = Date.now();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "INVALID_STORY_REQUEST", parsed.error.issues[0]?.message ?? "Invalid story request.", id);

  logEvent("info", "stories", "story.generate.started", {
    requestId: id,
    childId: parsed.data.childId,
    mode: parsed.data.mode,
    requestedMinutes: parsed.data.minutes,
    providerEnabled: Boolean(process.env.OPENAI_API_KEY),
  });

  try {
    const child = await prisma.childProfile.findUniqueOrThrow({ where: { id: parsed.data.childId } });
    const result = await generateStory(
      {
        ...child,
        bedtimeTone: parsed.data.tone || child.bedtimeTone,
        preferredStoryMinutes: parsed.data.minutes || child.preferredStoryMinutes,
      },
      parsed.data.mode,
      parsed.data.prompt,
      "",
      id,
    );
    const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
    const bad = findUnsafe(
      result.fullText,
      [...child.avoidTopics.split(","), ...(settings?.globalAvoidTopics || "").split(",")],
      parsed.data.prompt,
    );
    if (bad.length) {
      logEvent("warn", "stories", "story.generate.rejected", { requestId: id, durationMs: Date.now() - startedAt, ruleCount: bad.length });
      return apiError(422, "STORY_POLICY_REJECTED", "The generated story included an avoided topic. Please try another theme.", id);
    }
    const story = await prisma.story.create({
      data: {
        childId: parsed.data.childId,
        title: result.title,
        mode: parsed.data.mode,
        prompt: parsed.data.prompt,
        fullText: result.fullText,
        scenes: { create: result.scenes.map((scene, position) => ({ ...scene, position })) },
      },
    });
    logEvent("info", "stories", "story.generate.completed", {
      requestId: id,
      storyId: story.id,
      durationMs: Date.now() - startedAt,
      sceneCount: result.scenes.length,
      characterCount: result.fullText.length,
    });
    return apiJson({ id: story.id }, id);
  } catch (error) {
    logEvent("error", "stories", "story.generate.failed", {
      requestId: id,
      durationMs: Date.now() - startedAt,
      ...safeError(error),
    });
    const providerStatus = (error as { status?: number }).status;
    const code = providerStatus === 429 ? "OPENAI_QUOTA_OR_RATE_LIMIT" : "STORY_GENERATION_FAILED";
    const message = providerStatus === 429
      ? "OpenAI rejected the request because of quota or rate limits. Check API billing and try again."
      : "Story generation failed. Check the server log using the request ID shown here.";
    return apiError(providerStatus === 429 ? 429 : 500, code, message, id, providerStatus === 429 || providerStatus === 500);
  }
}
