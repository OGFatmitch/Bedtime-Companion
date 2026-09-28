import { prisma } from "./prisma";
import { commitMedia, createFallbackWav } from "./mediaStore";
import type { CreateSessionInput, DeviceCommandEnvelope, MediaManifest } from "@/packages/contracts";
import { assertTransition } from "./sessionState";

async function createCommand(input: {
  deviceId: string;
  sessionId?: string;
  name: string;
  payload: Record<string, unknown>;
}) {
  return prisma.$transaction(async (tx) => {
    const device = await tx.deviceNode.findUniqueOrThrow({ where: { id: input.deviceId } });
    const sequence = device.lastCommandSequence + 1;
    await tx.deviceNode.update({ where: { id: input.deviceId }, data: { lastCommandSequence: sequence } });
    return tx.deviceCommand.create({
      data: {
        deviceId: input.deviceId,
        sessionId: input.sessionId,
        sequence,
        name: input.name,
        payloadJson: JSON.stringify(input.payload),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
  });
}

export function commandEnvelope(command: {
  id: string;
  sequence: number;
  deviceId: string;
  sessionId: string | null;
  name: string;
  payloadJson: string;
  createdAt: Date;
  expiresAt: Date | null;
}): DeviceCommandEnvelope {
  return {
    type: "command",
    commandId: command.id,
    sequence: command.sequence,
    deviceId: command.deviceId,
    sessionId: command.sessionId,
    issuedAt: command.createdAt.toISOString(),
    expiresAt: command.expiresAt?.toISOString() ?? null,
    name: command.name,
    payload: JSON.parse(command.payloadJson) as Record<string, unknown>,
  };
}

function mediaManifest(asset: {
  id: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  durationMs: number;
}): MediaManifest {
  return {
    assetId: asset.id,
    url: `/api/v1/media/${asset.id}`,
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
    sha256: asset.sha256,
    durationMs: asset.durationMs,
  };
}

async function createFallbackItem(sessionId: string, position: number) {
  const committed = await commitMedia({
    data: createFallbackWav(),
    fileName: `fallback-${crypto.randomUUID()}.wav`,
  });
  const asset = await prisma.mediaAsset.create({
    data: {
      ...committed,
      mimeType: "audio/wav",
      durationMs: 1800,
      provider: "built-in-fixture",
    },
  });
  const item = await prisma.queueItem.create({
    data: {
      sessionId,
      position,
      type: "audio",
      status: "READY",
      text: "Bedtime Companion connection test",
      mediaAssetId: asset.id,
    },
  });
  return { item, asset };
}

export async function createSession(input: CreateSessionInput) {
  const session = await prisma.session.create({
    data: {
      deviceId: input.deviceId,
      profileId: input.profileId,
      storyId: input.storyId,
      mode: input.mode,
      requestedDurationMinutes: input.durationMinutes,
      requestedTheme: input.theme,
      state: "CREATED",
    },
  });

  await prisma.session.update({ where: { id: session.id }, data: { state: "PREPARING" } });
  const narratedSceneCount = input.storyId ? await prisma.audioChunk.count({ where: { storyId: input.storyId } }) : 0;
  const storyAssets = input.storyId
    ? (
        await prisma.mediaAsset.findMany({
          where: { storyId: input.storyId, state: "READY" },
          orderBy: { createdAt: "desc" },
          take: narratedSceneCount,
        })
      ).reverse()
    : [];
  const playable = storyAssets.length
    ? await Promise.all(
        storyAssets.map(async (asset, position) => ({
          asset,
          item: await prisma.queueItem.create({
            data: { sessionId: session.id, position, type: "audio", status: "READY", mediaAssetId: asset.id },
          }),
        })),
      )
    : [await createFallbackItem(session.id, 0)];
  const ready = await prisma.session.update({ where: { id: session.id }, data: { state: "READY", activeItemId: playable[0].item.id } });
  for (const [index, entry] of playable.entries()) {
    await createCommand({
      deviceId: input.deviceId,
      sessionId: session.id,
      name: index === 0 ? "play" : "media.prefetch",
      payload: { itemId: entry.item.id, asset: mediaManifest(entry.asset), offsetMs: 0 },
    });
  }
  return ready;
}

export async function appendOneMore(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId }, include: { items: true } });
  if (session.mode !== "story") throw new Error("One more is only available for standard story sessions.");
  const position = session.items.reduce((maximum, item) => Math.max(maximum, item.position), -1) + 1;
  const { item, asset } = await createFallbackItem(session.id, position);
  const shouldPlayNow = ["COMPLETED", "STOPPED", "ERROR"].includes(session.state);
  if (shouldPlayNow) {
    await prisma.session.update({ where: { id: sessionId }, data: { state: "READY", activeItemId: item.id, completedAt: null, errorCode: null, errorMessage: null } });
  }
  await createCommand({
    deviceId: session.deviceId,
    sessionId,
    name: shouldPlayNow ? "play" : "media.prefetch",
    payload: { itemId: item.id, asset: mediaManifest(asset), offsetMs: 0 },
  });
  return item;
}

export async function sessionAction(sessionId: string, action: "one_more" | "pause" | "resume" | "stop") {
  if (action === "one_more") return appendOneMore(sessionId);
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  const state = action === "pause" ? "PAUSED" : action === "resume" ? "PLAYING" : "STOPPING";
  assertTransition(session.state, state);
  const name = action;
  await prisma.session.update({ where: { id: sessionId }, data: { state } });
  await createCommand({ deviceId: session.deviceId, sessionId, name, payload: { itemId: session.activeItemId } });
  return prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
}

export async function getSessionSnapshot(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      items: { orderBy: { position: "asc" }, include: { mediaAsset: true } },
      device: { select: { id: true, name: true, lastSeenAt: true } },
      profile: { select: { id: true, name: true } },
    },
  });
}

export async function queueNextItem(sessionId: string, completedItemId: string) {
  await prisma.queueItem.updateMany({ where: { id: completedItemId, sessionId }, data: { status: "COMPLETED" } });
  const next = await prisma.queueItem.findFirst({
    where: { sessionId, status: "READY" },
    orderBy: { position: "asc" },
    include: { mediaAsset: true },
  });
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  if (!next?.mediaAsset) {
    await prisma.session.update({ where: { id: sessionId }, data: { state: "COMPLETED", completedAt: new Date(), activeItemId: null } });
    return null;
  }
  await prisma.session.update({ where: { id: sessionId }, data: { state: "READY", activeItemId: next.id } });
  return createCommand({
    deviceId: session.deviceId,
    sessionId,
    name: "play",
    payload: { itemId: next.id, asset: mediaManifest(next.mediaAsset), offsetMs: 0 },
  });
}
