export async function GET() {
  return Response.json({ ok: true, service: "bedtime-companion", time: new Date().toISOString() });
}

