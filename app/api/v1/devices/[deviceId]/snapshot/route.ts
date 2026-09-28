import { apiError, apiJson, requestId } from "@/lib/api";
import { authenticateDevice } from "@/lib/deviceAuth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: Promise<{ deviceId: string }> }) {
  const id = requestId(request);
  const { deviceId } = await context.params;
  if (!(await authenticateDevice(request, deviceId))) return apiError(401, "DEVICE_UNAUTHORIZED", "Invalid device credentials.", id);
  const device = await prisma.deviceNode.findUnique({ where: { id: deviceId } });
  const session = await prisma.session.findFirst({
    where: { deviceId, state: { notIn: ["STOPPED", "COMPLETED", "ERROR"] } },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { position: "asc" }, include: { mediaAsset: true } } },
  });
  return apiJson({ device, activeSession: session, lastCommandSequence: device?.lastCommandSequence ?? 0 }, id);
}

