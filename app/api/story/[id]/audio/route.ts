import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { apiError, apiJson, requestId } from "@/lib/api";
import { logEvent, safeError } from "@/lib/logger";
import { OpenAITTSProvider } from "@/lib/openaiTTS";
import { prisma } from "@/lib/prisma";

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, work: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await work(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  const startedAt = Date.now();
  const { id: storyId } = await context.params;
  logEvent("info", "speech", "narration.generate.started", { requestId: id, storyId });
  try {
    const story = await prisma.story.findUniqueOrThrow({
      where: { id: storyId },
      include: { scenes: { orderBy: { position: "asc" } } },
    });
    const voice = (await prisma.appSettings.findUnique({ where: { id: "default" } }))?.defaultVoice || "coral";
    const tts = new OpenAITTSProvider();
    const chunks = await mapWithConcurrency(story.scenes, 2, async (scene, position) => {
      const sceneStartedAt = Date.now();
      const file = `${storyId}-${crypto.randomUUID()}-${position}.mp3`;
      const outputPath = path.join(process.cwd(), "public/audio", file);
      await tts.generateSpeech({ text: scene.text, voice, outputPath });
      const bytes = await fs.readFile(outputPath);
      const durationSeconds = Math.ceil(scene.text.split(/\s+/).length / 2.5);
      const chunk = { storyId, position, text: scene.text, audioUrl: `/audio/${file}`, durationEstimate: durationSeconds };
      await prisma.mediaAsset.create({
        data: {
          storyId,
          path: outputPath,
          mimeType: "audio/mpeg",
          byteLength: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          durationMs: durationSeconds * 1_000,
          provider: "openai",
          state: "READY",
        },
      });
      logEvent("info", "speech", "narration.scene.completed", {
        requestId: id,
        storyId,
        scenePosition: position,
        durationMs: Date.now() - sceneStartedAt,
        byteLength: bytes.byteLength,
      });
      return chunk;
    });
    await prisma.audioChunk.deleteMany({ where: { storyId } });
    await prisma.audioChunk.createMany({ data: chunks });
    logEvent("info", "speech", "narration.generate.completed", {
      requestId: id,
      storyId,
      durationMs: Date.now() - startedAt,
      sceneCount: chunks.length,
    });
    return apiJson({ ok: true }, id);
  } catch (error) {
    logEvent("error", "speech", "narration.generate.failed", {
      requestId: id,
      storyId,
      durationMs: Date.now() - startedAt,
      ...safeError(error),
    });
    const providerStatus = (error as { status?: number }).status;
    const message = providerStatus === 429
      ? "OpenAI rejected narration because of quota or rate limits. Check API billing and try again."
      : "Narration failed. Check the server log using this request ID.";
    return apiError(providerStatus === 429 ? 429 : 500, "NARRATION_GENERATION_FAILED", message, id, true);
  }
}
