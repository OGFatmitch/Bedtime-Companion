import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";

export function mediaRoot() {
  return path.resolve(process.cwd(), process.env.MEDIA_ROOT ?? "data/media");
}

export async function commitMedia(input: { data: Buffer; fileName: string }) {
  const root = mediaRoot();
  await fs.mkdir(root, { recursive: true });
  const finalPath = path.join(root, path.basename(input.fileName));
  const temporaryPath = `${finalPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, input.data, { flag: "wx" });
  await fs.rename(temporaryPath, finalPath);
  return {
    path: finalPath,
    byteLength: input.data.byteLength,
    sha256: createHash("sha256").update(input.data).digest("hex"),
  };
}

export function createFallbackWav(durationMs = 1800) {
  const sampleRate = 16_000;
  const sampleCount = Math.floor((durationMs / 1000) * sampleRate);
  const dataLength = sampleCount * 2;
  const output = Buffer.alloc(44 + dataLength);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + dataLength, 4);
  output.write("WAVEfmt ", 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36);
  output.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.min(1, index / 800, (sampleCount - index) / 800);
    const sample = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.08 * envelope;
    output.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }
  return output;
}

