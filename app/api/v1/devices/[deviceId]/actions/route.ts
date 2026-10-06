import { apiError, apiJson, requestId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createCommand } from "@/lib/sessionService";
import { deviceActionSchema } from "@/packages/contracts";

export async function POST(request: Request, context: { params: Promise<{ deviceId: string }> }) {
  const id = requestId(request);
  const { deviceId } = await context.params;
  const body = deviceActionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError(400, "INVALID_DEVICE_ACTION", body.error.issues[0]?.message ?? "Invalid device action.", id);
  const device = await prisma.deviceNode.findUnique({ where: { id: deviceId } });
  if (!device) return apiError(404, "DEVICE_NOT_FOUND", "Bedroom node not found.", id);
  const command = await createCommand({
    deviceId,
    name: body.data.action,
    payload: { percent: body.data.percent },
  });
  let currentState: Record<string, unknown> = {};
  try { currentState = JSON.parse(device.lastStateJson) as Record<string, unknown>; } catch { /* Keep an empty snapshot. */ }
  await prisma.deviceNode.update({ where: { id: deviceId }, data: { lastStateJson: JSON.stringify({ ...currentState, volume: body.data.percent }) } });
  return apiJson({ commandId: command.id, sequence: command.sequence, percent: body.data.percent }, id, 202);
}
