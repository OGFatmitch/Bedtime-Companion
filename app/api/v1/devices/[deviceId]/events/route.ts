import { apiError, apiJson, requestId } from "@/lib/api";
import { authenticateDevice } from "@/lib/deviceAuth";
import { prisma } from "@/lib/prisma";
import { queueNextItem } from "@/lib/sessionService";
import { deviceEventsSchema, type DeviceEventInput } from "@/packages/contracts";

async function applyEvent(event: DeviceEventInput) {
  const existing = await prisma.deviceEvent.findUnique({ where: { id: event.eventId } });
  if (existing) return;
  await prisma.deviceEvent.create({
    data: {
      id: event.eventId,
      deviceId: event.deviceId,
      sessionId: event.sessionId,
      bootId: event.bootId,
      name: event.name,
      payloadJson: JSON.stringify(event.payload),
      occurredAt: new Date(event.occurredAt),
    },
  });
  await prisma.deviceNode.update({
    where: { id: event.deviceId },
    data: {
      lastSeenAt: new Date(),
      lastBootId: event.bootId,
      ...(event.name === "device.heartbeat" ? { lastStateJson: JSON.stringify(event.payload) } : {}),
    },
  });
  if (event.name === "command.acknowledged" && typeof event.payload.commandId === "string") {
    const command = await prisma.deviceCommand.findFirst({ where: { id: event.payload.commandId, deviceId: event.deviceId } });
    await prisma.deviceCommand.updateMany({
      where: { id: event.payload.commandId, deviceId: event.deviceId },
      data: { acknowledgedAt: new Date(), acknowledgement: String(event.payload.status ?? "accepted") },
    });
    if (command?.name === "stop" && command.sessionId) {
      await prisma.session.updateMany({ where: { id: command.sessionId, state: "STOPPING" }, data: { state: "STOPPED", activeItemId: null } });
    }
  }
  if (event.sessionId && event.name === "playback.started") {
    const itemId = typeof event.payload.itemId === "string" ? event.payload.itemId : undefined;
    await prisma.session.updateMany({ where: { id: event.sessionId, deviceId: event.deviceId }, data: { state: "PLAYING", activeItemId: itemId } });
    if (itemId) await prisma.queueItem.updateMany({ where: { id: itemId, sessionId: event.sessionId }, data: { status: "PLAYING" } });
  }
  if (event.sessionId && event.name === "playback.completed" && typeof event.payload.itemId === "string") {
    await queueNextItem(event.sessionId, event.payload.itemId);
  }
  if (event.sessionId && event.name === "playback.stopped") {
    await prisma.session.updateMany({
      where: { id: event.sessionId, state: "STOPPING" },
      data: { state: "STOPPED", completedAt: new Date(), activeItemId: null },
    });
  }
  if (event.sessionId && event.name === "playback.failed") {
    await prisma.session.updateMany({
      where: { id: event.sessionId, deviceId: event.deviceId },
      data: { state: "ERROR", errorCode: "PLAYBACK_FAILED", errorMessage: "The bedroom node could not play this item." },
    });
  }
}

export async function POST(request: Request, context: { params: Promise<{ deviceId: string }> }) {
  const id = requestId(request);
  const { deviceId } = await context.params;
  if (!(await authenticateDevice(request, deviceId))) return apiError(401, "DEVICE_UNAUTHORIZED", "Invalid device credentials.", id);
  const parsed = deviceEventsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "INVALID_EVENT", parsed.error.issues[0]?.message ?? "Invalid device event.", id);
  const events = "events" in parsed.data ? parsed.data.events : [parsed.data];
  if (events.some((event) => event.deviceId !== deviceId)) return apiError(403, "DEVICE_MISMATCH", "Event device does not match route.", id);
  for (const event of events) await applyEvent(event);
  return apiJson({ acceptedEventIds: events.map((event) => event.eventId) }, id, 202);
}
