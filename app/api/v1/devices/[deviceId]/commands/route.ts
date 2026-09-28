import { apiError, apiJson, requestId } from "@/lib/api";
import { authenticateDevice } from "@/lib/deviceAuth";
import { prisma } from "@/lib/prisma";
import { commandEnvelope } from "@/lib/sessionService";

export async function GET(request: Request, context: { params: Promise<{ deviceId: string }> }) {
  const id = requestId(request);
  const { deviceId } = await context.params;
  if (!(await authenticateDevice(request, deviceId))) return apiError(401, "DEVICE_UNAUTHORIZED", "Invalid device credentials.", id);
  const url = new URL(request.url);
  const after = Math.max(0, Number(url.searchParams.get("after") ?? 0) || 0);
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  const commands = await prisma.deviceCommand.findMany({
    where: { deviceId, sequence: { gt: after } },
    orderBy: { sequence: "asc" },
    take: limit,
  });
  await prisma.deviceNode.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });
  return apiJson({ commands: commands.map(commandEnvelope), nextCursor: commands.at(-1)?.sequence ?? after }, id);
}

