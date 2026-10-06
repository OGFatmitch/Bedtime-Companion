import { createHash, randomUUID } from "crypto";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import fs from "fs/promises";
import { createConnection, type Socket } from "net";
import path from "path";
import type { DeviceCommandEnvelope, MediaManifest } from "../../../packages/contracts";

const serverUrl = (process.env.BEDTIME_SERVER_URL ?? "http://localhost:3000").replace(/\/$/, "");
const deviceId = process.env.BEDTIME_DEVICE_ID ?? "emma-room";
const token = process.env.BEDTIME_DEVICE_TOKEN ?? process.env.EMMA_DEVICE_TOKEN ?? "emma-room-dev-token";
const cacheDir = path.resolve(process.env.BEDTIME_CACHE_DIR ?? "data/pi-simulator-cache");
const audioPlayer = process.env.BEDTIME_AUDIO_PLAYER ?? "simulate";
const audioDevice = process.env.BEDTIME_AUDIO_DEVICE ?? "default";
const muteGpio = process.env.BEDTIME_AUDIO_MUTE_GPIO;
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
let lastHeartbeatAt = 0;
let playbackProcess: ChildProcess | null = null;
let playbackGeneration = 0;
let preEndFadeTimer: NodeJS.Timeout | null = null;
let mpvProcess: ChildProcess | null = null;
let mpvSocket: Socket | null = null;
let mpvOutput = "";
let activeMpv: { generation: number; itemId: string; sessionId: string | null; durationMs: number; loaded: boolean } | null = null;
const mpvSocketPath = path.join(cacheDir, "mpv.sock");

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

function stopPlayback() {
  playbackGeneration += 1;
  if (preEndFadeTimer) clearTimeout(preEndFadeTimer);
  preEndFadeTimer = null;
  const child = playbackProcess;
  playbackProcess = null;
  if (child && child.exitCode === null) {
    writePlayer(child, "STOP\nQUIT");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    }, 500);
  }
  if (mpvSocket) {
    activeMpv = null;
    mpvCommand(["stop"]);
  }
}

function setAmplifierMuted(muted: boolean) {
  if (!muteGpio) return;
  const result = spawnSync("pinctrl", ["set", muteGpio, "op", muted ? "dl" : "dh"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not ${muted ? "mute" : "unmute"} amplifier: ${result.stderr.trim()}`);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fadePlayer(from: number, to: number, durationMs = 120) {
  const steps = 6;
  for (let step = 1; step <= steps; step += 1) {
    const volume = Math.round(from + ((to - from) * step) / steps);
    if (audioPlayer === "mpv") mpvCommand(["set_property", "volume", volume]);
    else if (playbackProcess) writePlayer(playbackProcess, `VOLUME ${volume}`);
    await wait(durationMs / steps);
  }
}

async function mutePlayback() {
  if (playbackProcess || mpvSocket) await fadePlayer(state.volume, 0);
  setAmplifierMuted(true);
}

async function unmutePlayback() {
  if (!playbackProcess && !mpvSocket) return;
  if (audioPlayer === "mpv") mpvCommand(["set_property", "volume", 0]);
  else if (playbackProcess) writePlayer(playbackProcess, "VOLUME 0");
  await wait(60);
  setAmplifierMuted(false);
  await fadePlayer(0, state.volume);
}

function mpvCommand(command: unknown[]) {
  if (!mpvSocket?.writable || mpvSocket.destroyed) return false;
  mpvSocket.write(`${JSON.stringify({ command })}\n`);
  return true;
}

async function connectMpvSocket() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      return await new Promise<Socket>((resolve, reject) => {
        const socket = createConnection(mpvSocketPath);
        socket.once("connect", () => resolve(socket));
        socket.once("error", reject);
      });
    } catch {
      await wait(100);
    }
  }
  throw new Error("Timed out connecting to the mpv control socket.");
}

async function ensureMpv() {
  if (mpvProcess && mpvSocket) return;
  await fs.unlink(mpvSocketPath).catch(() => undefined);
  mpvProcess = spawn(
    "mpv",
    [
      "--idle=yes",
      "--no-video",
      "--really-quiet",
      "--audio-stream-silence=yes",
      "--keep-open=yes",
      "--gapless-audio=yes",
      `--audio-device=${audioDevice}`,
      `--input-ipc-server=${mpvSocketPath}`,
      "--volume=0",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  mpvProcess.once("exit", (code, signal) => {
    mpvProcess = null;
    mpvSocket?.destroy();
    mpvSocket = null;
    if (!stopped) console.error(`mpv exited with ${code ?? signal}`);
  });
  mpvSocket = await connectMpvSocket();
  mpvSocket.setEncoding("utf8");
  mpvSocket.on("data", (chunk: string) => {
    mpvOutput += chunk;
    const lines = mpvOutput.split("\n");
    mpvOutput = lines.pop() ?? "";
    for (const line of lines) {
      try {
        const message = JSON.parse(line) as { event?: string; name?: string; data?: unknown };
        if (message.event === "file-loaded") {
          if (activeMpv) activeMpv.loaded = true;
          mpvCommand(["set_property", "pause", false]);
          void unmutePlayback().catch((error) => console.error(error instanceof Error ? error.message : error));
        } else if (message.event === "property-change" && message.name === "eof-reached" && message.data === true && activeMpv?.loaded) {
          const finished = activeMpv;
          activeMpv = null;
          void completePlayback(finished.generation, finished.itemId, finished.sessionId, finished.durationMs);
        }
      } catch {
        // Ignore non-JSON diagnostic output.
      }
    }
  });
  mpvSocket.on("error", (error) => {
    if (!stopped) console.error(`mpv control error: ${error.message}`);
  });
  mpvCommand(["observe_property", 1, "eof-reached"]);
}

function writePlayer(child: ChildProcess, command: string) {
  if (!child.stdin?.writable || child.stdin.destroyed) return false;
  child.stdin.write(`${command}\n`, (error) => {
    if (error && (error as NodeJS.ErrnoException).code !== "EPIPE") console.error(`Player control failed: ${error.message}`);
  });
  return true;
}

function playerCommand(command: string) {
  if (!playbackProcess || !writePlayer(playbackProcess, command)) throw new Error("Audio player is not running.");
}

async function startPlayback(filePath: string, itemId: string, sessionId: string | null, durationMs: number) {
  if (audioPlayer === "mpv") {
    await ensureMpv();
    playbackGeneration += 1;
    activeMpv = { generation: playbackGeneration, itemId, sessionId, durationMs, loaded: false };
    mpvCommand(["set_property", "volume", 0]);
    if (!mpvCommand(["loadfile", filePath, "replace"])) throw new Error("mpv control socket is unavailable.");
    mpvCommand(["set_property", "pause", false]);
    return;
  }
  stopPlayback();
  const generation = playbackGeneration;

  if (audioPlayer === "simulate") {
    setTimeout(() => void completePlayback(generation, itemId, sessionId, durationMs), Math.min(durationMs, 2_000));
    return;
  }

  if (audioPlayer !== "mpg123") throw new Error(`Unsupported BEDTIME_AUDIO_PLAYER: ${audioPlayer}`);
  setAmplifierMuted(true);
  const child = spawn("mpg123", ["-R", "-a", audioDevice], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  playbackProcess = child;
  child.stdin?.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") console.error(`Player input failed: ${error.message}`);
  });
  let output = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    output += chunk;
    const lines = output.split("\n");
    output = lines.pop() ?? "";
    if (lines.some((line) => line.trim() === "@P 0")) {
      writePlayer(child, "QUIT");
      void completePlayback(generation, itemId, sessionId, durationMs);
    }
  });
  child.once("error", (error) => void failPlayback(generation, itemId, sessionId, error));
  child.once("exit", (code, signal) => {
    if (generation !== playbackGeneration) return;
    playbackProcess = null;
    if (code !== 0) void failPlayback(generation, itemId, sessionId, new Error(`mpg123 exited with ${code ?? signal}`));
  });
  writePlayer(child, "VOLUME 0");
  writePlayer(child, `LOAD ${filePath}`);
  await unmutePlayback();
  if (durationMs > 300) {
    preEndFadeTimer = setTimeout(() => {
      void mutePlayback().catch((error) => console.error(error instanceof Error ? error.message : error));
    }, durationMs - 180);
  }
}

async function completePlayback(generation: number, itemId: string, sessionId: string | null, durationMs: number) {
  if (generation !== playbackGeneration || state.itemId !== itemId) return;
  await sendEvent("playback.completed", { itemId, positionMs: durationMs }, sessionId);
  state = { ...state, itemId: null, playbackState: "idle", positionMs: 0 };
  await saveState();
}

async function failPlayback(generation: number, itemId: string, sessionId: string | null, error: Error) {
  if (generation !== playbackGeneration) return;
  console.error(`Playback failed: ${error.message}`);
  await sendEvent("playback.failed", { itemId, reason: error.message }, sessionId);
  state = { ...state, itemId: null, playbackState: "error", positionMs: 0 };
  await saveState();
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
    const filePath = await download(asset);
    state = { ...state, sessionId: command.sessionId, itemId, playbackState: "playing", positionMs: 0 };
    await saveState();
    await sendEvent("playback.started", { itemId, positionMs: 0 }, command.sessionId);
    await startPlayback(filePath, itemId, command.sessionId, asset.durationMs);
  } else if (command.name === "pause") {
    if (audioPlayer === "mpv") {
      await fadePlayer(state.volume, 0);
      mpvCommand(["set_property", "pause", true]);
    } else {
      await mutePlayback();
      playerCommand("PAUSE");
    }
    state.playbackState = "paused";
  } else if (command.name === "resume") {
    if (audioPlayer === "mpv") {
      mpvCommand(["set_property", "pause", false]);
      await fadePlayer(0, state.volume);
    } else {
      setAmplifierMuted(true);
      playerCommand("VOLUME 0");
      playerCommand("PAUSE");
      await unmutePlayback();
    }
    state.playbackState = "playing";
  } else if (command.name === "stop") {
    await fadePlayer(state.volume, 0);
    stopPlayback();
    setAmplifierMuted(true);
    await sendEvent("playback.stopped", { itemId: state.itemId, positionMs: state.positionMs }, command.sessionId);
    state = { ...state, sessionId: null, itemId: null, playbackState: "idle", positionMs: 0 };
  } else if (command.name === "volume.set") {
    const nextVolume = Math.min(70, Math.max(0, Number(command.payload.percent)));
    if (Number.isFinite(nextVolume)) {
      if (state.playbackState === "playing") await fadePlayer(state.volume, nextVolume);
      else if (audioPlayer === "mpv") mpvCommand(["set_property", "volume", nextVolume]);
      state.volume = nextVolume;
    }
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
  setAmplifierMuted(true);
  await loadState();
  if (audioPlayer === "mpv") await ensureMpv();
  await connect();
  while (!stopped) {
    try {
      if (Date.now() - lastHeartbeatAt >= 10_000) {
        await sendEvent("device.heartbeat", { ...state });
        lastHeartbeatAt = Date.now();
      }
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
  try {
    setAmplifierMuted(true);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
  stopPlayback();
  if (mpvSocket) mpvCommand(["quit"]);
  mpvSocket?.destroy();
  mpvProcess?.kill("SIGTERM");
});

run().catch((error) => {
  console.error(error);
  try {
    setAmplifierMuted(true);
  } catch (muteError) {
    console.error(muteError instanceof Error ? muteError.message : muteError);
  }
  mpvSocket?.destroy();
  mpvProcess?.kill("SIGTERM");
  process.exit(1);
});
