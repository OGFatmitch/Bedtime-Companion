import { apiError, apiJson, requestId } from "@/lib/api";
import { getSessionSnapshot } from "@/lib/sessionService";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const id = requestId(request);
  const { sessionId } = await context.params;
  const session = await getSessionSnapshot(sessionId);
  return session ? apiJson({ session }, id) : apiError(404, "SESSION_NOT_FOUND", "Session not found.", id);
}

