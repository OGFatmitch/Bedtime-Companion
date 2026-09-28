import fs from "fs/promises";
import { constants } from "fs";
import { mediaRoot } from "@/lib/mediaStore";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await fs.mkdir(mediaRoot(), { recursive: true });
    await fs.access(mediaRoot(), constants.W_OK);
    return Response.json({ ok: true, database: "ready", media: "writable" });
  } catch {
    return Response.json({ ok: false, code: "NOT_READY" }, { status: 503 });
  }
}
