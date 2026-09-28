import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";

export function hashDeviceToken(token: string) {
  const pepper = process.env.DEVICE_TOKEN_PEPPER ?? "local-development-only";
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

export async function authenticateDevice(request: Request, deviceId: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length);
  const device = await prisma.deviceNode.findUnique({ where: { id: deviceId } });
  if (!device?.tokenHash) return null;

  const actual = Buffer.from(hashDeviceToken(token));
  const expected = Buffer.from(device.tokenHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? device : null;
}

