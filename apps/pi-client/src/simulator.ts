import { createHash, randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import type { DeviceCommandEnvelope, MediaManifest } from "../../../packages/contracts";

const serverUrl = (process.env.BEDTIME_SERVER_URL ?? "http://localhost:3000").replace(/\/$/, "");
const deviceId = process.env.BEDTIME_DEVICE_ID ?? "emma-room";
const token = process.env.BEDTIME_DEVICE_TOKEN ?? process.env.EMMA_DEVICE_TOKEN ?? "emma-room-dev-token";
const cacheDir = path.resolve(process.env.BEDTIME_CACHE_DIR ?? "data/pi-simulator-cache");
const statePath = path.join(cacheDir, "client-state.json");
const bootId = `boot_${randomUUID()}`;

type LocalState = {
  sessionId: string | null;
  itemId: string | null;
  playbackState: "idle" | "playing" | "paused" | "error";
  positionMs: number;
  lastCommandSequence: number;
  volume: number;
};

let state: LocalState = {
  sessionId: null,
  itemId: null,
  playbackState: "idle",
  positionMs: 0,
  lastCommandSequence: 0,
  volume: 45,
};
let stopped = false;

const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", "x-device-id": deviceId };

async function loadState() {
  await fs.mkdir(cacheDir, { recursive: true });
  try {
    state = { ...state, ...(JSON.parse(await fs.readFile(statePath, "utf8")) as Partial<LocalState>) };
  } catch {
    await saveState();
  }
}

async function saveState() {
  const temporary = `${statePath}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(state, null, 2));
  await fs.rename(temporary, statePath);
}

async function api(pathname: string, init?: RequestInit) {
  const response = await fetch(`${serverUrl}${pathname}`, { ...init, headers: { ...headers, ...init?.headers } });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response;
}

async function sendEvent(name: string, payload: Record<string, unknown>, sessionId = state.sessionId) {
  await api(`/api/v1/devices/${deviceId}/events`, {
    method: "POST",
    body: JSON.stringify({
      type: "event",
      eventId: `evt_${randomUUID()}`,
      deviceId,
      bootId,
      sessionId,
      occurredAt: new Date().toISOString(),
      name,
      payload,
    }),
  });
}

async function download(asset: MediaManifest) {
  const target = path.join(cacheDir, `${asset.assetId}${asset.mimeType === "audio/wav" ? ".wav" : ".audio"}`);
  try {
    const existing = await fs.readFile(target);
    if (createHash("sha256").update(existing).digest("hex") === asset.sha256) return target;
  } catch {
    // Cache miss is normal.
  }
  const response = await api(asset.url);
  const data = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(data).digest("hex");
  if (data.byteLength !== asset.byteLength || digest !== asset.sha256) throw new Error("Downloaded media failed checksum validation.");
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, data, { flag: "wx" });
  await fs.rename(temporary, target);
  return target;
}

async function acknowledge(command: DeviceCommandEnvelope, status = "accepted", reason?: string) {
  await sendEvent("command.acknowledged", { commandId: command.commandId, sequence: command.sequence, status, reason }, command.sessionId);
}

async function applyCommand(command: DeviceCommandEnvelope) {
  if (command.sequence <= state.lastCommandSequence) {
    await acknowledge(command);
    return;
  }
  if (command.sequence !== state.lastCommandSequence + 1) throw new Error(`Command sequence gap: expected ${state.lastCommandSequence + 1}, received ${command.sequence}`);
  if (command.expiresAt && Date.parse(command.expiresAt) < Date.now()) {
    await acknowledge(command, "rejected", "expired");
    state.lastCommandSequence = command.sequence;
    await saveState();
    return;
  }

  if (command.name === "media.prefetch") {
    await download(command.payload.asset as MediaManifest);
  } else if (command.name === "play") {
    const itemId = String(command.payload.itemId);
    const asset = command.payload.asset as MediaManifest;
    await download(asset);
    state = { ...state, sessionId: command.sessionId, itemId, playbackState: "playing", positionMs: 0 };
    await saveState();
    await sendEvent("playback.started", { itemId, positionMs: 0 }, command.sessionId);
    await new Promise((resolve) => setTimeout(resolve, Math.min(asset.durationMs, 2_000)));
    if (state.playbackState === "playing" && state.itemId === itemId) {
      await sendEvent("playback.completed", { itemId, positionMs: asset.durationMs }, command.sessionId);
      state = { ...state, itemId: null, playbackState: "idle", positionMs: 0 };
    }
  } else if (command.name === "pause") {
    state.playbackState = "paused";
  } else if (command.name === "resume") {
    state.playbackState = "playing";
  } else if (command.name === "stop") {
    state = { ...state, sessionId: null, itemId: null, playbackState: "idle", positionMs: 0 };
  } else if (command.name === "volume.set") {
    state.volume = Math.min(70, Math.max(0, Number(command.payload.percent) || state.volume));
  }
  state.lastCommandSequence = command.sequence;
  await saveState();
  await acknowledge(command);
}

async function connect() {
  const response = await api(`/api/v1/devices/${deviceId}/connect`, {
    method: "POST",
    body: JSON.stringify({
      clientVersion: "0.1.0",
      bootId,
      capabilities: { audio: true, microphone: false, rgbw: false, buttons: ["power", "volume_up", "volume_down", "story"] },
      localState: state,
    }),
  });
  const data = (await response.json()) as { nextCommandCursor?: number };
  console.log(`Connected ${deviceId} to ${serverUrl}; local cursor ${state.lastCommandSequence}, server cursor ${data.nextCommandCursor ?? 0}.`);
}

async function run() {
  await loadState();
  await connect();
  while (!stopped) {
    try {
      const response = await api(`/api/v1/devices/${deviceId}/commands?after=${state.lastCommandSequence}&limit=20`);
      const body = (await response.json()) as { commands: DeviceCommandEnvelope[] };
      for (const command of body.commands) await applyCommand(command);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, state.playbackState === "idle" ? 2_000 : 500));
  }
}

process.on("SIGINT", () => {
  stopped = true;
});

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

