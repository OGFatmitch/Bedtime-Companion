import { createSessionSchema } from "@/packages/contracts";
import { apiError, apiJson, requestId } from "@/lib/api";
import { createSession, getSessionSnapshot } from "@/lib/sessionService";

export async function POST(request: Request) {
  const id = requestId(request);
  const parsed = createSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.", id);
  try {
    const session = await createSession(parsed.data);
    const snapshot = await getSessionSnapshot(session.id);
    return apiJson({ session: snapshot }, id, 202);
  } catch (error) {
    return apiError(500, "SESSION_CREATE_FAILED", error instanceof Error ? error.message : "Could not start session.", id, true);
  }
}

