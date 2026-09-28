type LogLevel = "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  component: string,
  event: string,
  fields: Record<string, unknown> = {},
) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    component,
    event,
    ...fields,
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

export function safeError(error: unknown) {
  if (!(error instanceof Error)) return { errorName: "UnknownError", errorMessage: "Unknown failure" };
  const details = error as Error & { status?: number; code?: string; type?: string };
  return {
    errorName: details.name,
    errorMessage: details.message.slice(0, 500),
    providerStatus: details.status,
    providerCode: details.code,
    providerType: details.type,
  };
}

