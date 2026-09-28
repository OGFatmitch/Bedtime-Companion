import fs from "fs/promises";
import { apiError, requestId } from "@/lib/api";
import { authenticateDevice } from "@/lib/deviceAuth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const id = requestId(request);
  const { assetId } = await context.params;
  const deviceId = request.headers.get("x-device-id");
  if (!deviceId || !(await authenticateDevice(request, deviceId))) return apiError(401, "DEVICE_UNAUTHORIZED", "Invalid device credentials.", id);
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, queueItems: { some: { session: { deviceId } } } },
  });
  if (!asset || asset.state !== "READY") return apiError(404, "MEDIA_NOT_FOUND", "Media is not available.", id);
  try {
    const data = await fs.readFile(asset.path);
    return new Response(data, {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(asset.byteLength),
        etag: `"${asset.sha256}"`,
        "cache-control": "private, max-age=31536000, immutable",
        "x-request-id": id,
      },
    });
  } catch {
    return apiError(503, "MEDIA_FILE_MISSING", "Media metadata exists but the file is unavailable.", id, true);
  }
}

