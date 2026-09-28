import { sessionActionSchema } from "@/packages/contracts";
import { apiError, apiJson, requestId } from "@/lib/api";
import { sessionAction } from "@/lib/sessionService";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const id = requestId(request);
  const body = sessionActionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError(400, "INVALID_ACTION", body.error.issues[0]?.message ?? "Invalid action.", id);
  try {
    const { sessionId } = await context.params;
    const result = await sessionAction(sessionId, body.data.action);
    return apiJson({ result }, id, 202);
  } catch (error) {
    return apiError(409, "SESSION_STATE_CONFLICT", error instanceof Error ? error.message : "Action failed.", id);
  }
}

