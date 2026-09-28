import { apiError, apiJson, requestId } from "@/lib/api";
import { authenticateDevice } from "@/lib/deviceAuth";
import { prisma } from "@/lib/prisma";
import { deviceConnectSchema } from "@/packages/contracts";

export async function POST(request: Request, context: { params: Promise<{ deviceId: string }> }) {
  const id = requestId(request);
  const { deviceId } = await context.params;
  const device = await authenticateDevice(request, deviceId);
  if (!device) return apiError(401, "DEVICE_UNAUTHORIZED", "Invalid device credentials.", id);
  const body = deviceConnectSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError(400, "INVALID_DEVICE_STATE", body.error.issues[0]?.message ?? "Invalid device state.", id);

  await prisma.deviceNode.update({
    where: { id: deviceId },
    data: {
      clientVersion: body.data.clientVersion,
      lastBootId: body.data.bootId,
      lastSeenAt: new Date(),
      lastStateJson: JSON.stringify(body.data.localState),
    },
  });
  const activeSession = await prisma.session.findFirst({
    where: { deviceId, state: { in: ["CREATED", "PREPARING", "READY", "PLAYING", "PAUSED", "INTERACTING"] } },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { position: "asc" } } },
  });
  return apiJson(
    {
      serverTime: new Date().toISOString(),
      heartbeatIntervalMs: 10_000,
      minimumClientVersion: "0.1.0",
      snapshot: { activeSession },
      nextCommandCursor: device.lastCommandSequence,
      pollingUrl: `/api/v1/devices/${deviceId}/commands`,
    },
    id,
  );
}

