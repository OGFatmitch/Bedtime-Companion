import { z } from "zod";

export const sessionModes = ["story", "interactive", "sleep_stream"] as const;
export const sessionStates = [
  "CREATED",
  "PREPARING",
  "READY",
  "PLAYING",
  "PAUSED",
  "INTERACTING",
  "STOPPING",
  "STOPPED",
  "COMPLETED",
  "ERROR",
] as const;

export const createSessionSchema = z
  .object({
    deviceId: z.string().min(1).max(100),
    profileId: z.string().min(1).max(100),
    storyId: z.string().min(1).max(100).optional(),
    mode: z.enum(sessionModes),
    durationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45)]).nullable().optional(),
    theme: z.string().trim().max(300).default(""),
    interactive: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.mode === "sleep_stream" && !value.durationMinutes) {
      context.addIssue({ code: "custom", path: ["durationMinutes"], message: "Sleep Stream requires 15, 30, or 45 minutes." });
    }
  });

export const sessionActionSchema = z.object({
  action: z.enum(["one_more", "pause", "resume", "stop"]),
});

export const deviceConnectSchema = z.object({
  clientVersion: z.string().min(1).max(40),
  bootId: z.string().min(1).max(100),
  capabilities: z.object({
    audio: z.boolean(),
    microphone: z.boolean(),
    rgbw: z.boolean(),
    buttons: z.array(z.enum(["power", "volume_up", "volume_down", "story"])),
  }),
  localState: z.object({
    sessionId: z.string().nullable(),
    itemId: z.string().nullable(),
    playbackState: z.enum(["idle", "playing", "paused", "error"]),
    positionMs: z.number().int().nonnegative(),
    lastCommandSequence: z.number().int().nonnegative(),
    volume: z.number().int().min(0).max(100),
  }),
});

export const deviceEventSchema = z.object({
  type: z.literal("event").default("event"),
  eventId: z.string().min(1).max(120),
  deviceId: z.string().min(1).max(100),
  bootId: z.string().min(1).max(100),
  sessionId: z.string().nullable(),
  occurredAt: z.string().datetime(),
  name: z.enum([
    "command.acknowledged",
    "device.heartbeat",
    "button.pressed",
    "playback.started",
    "playback.progress",
    "playback.completed",
    "playback.failed",
    "device.error",
    "device.shutdown_requested",
  ]),
  payload: z.record(z.unknown()).default({}),
});

export const deviceEventsSchema = z.union([
  deviceEventSchema,
  z.object({ events: z.array(deviceEventSchema).min(1).max(50) }),
]);

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type DeviceConnectInput = z.infer<typeof deviceConnectSchema>;
export type DeviceEventInput = z.infer<typeof deviceEventSchema>;

export type MediaManifest = {
  assetId: string;
  url: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  durationMs: number;
};

export type DeviceCommandEnvelope = {
  type: "command";
  commandId: string;
  sequence: number;
  deviceId: string;
  sessionId: string | null;
  issuedAt: string;
  expiresAt: string | null;
  name: string;
  payload: Record<string, unknown>;
};

