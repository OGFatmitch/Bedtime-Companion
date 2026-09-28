import { describe, expect, it } from "vitest";
import { createSessionSchema, deviceEventSchema } from ".";

describe("contracts", () => {
  it("requires a supported Sleep Stream duration", () => {
    expect(() => createSessionSchema.parse({ deviceId: "room", profileId: "child", mode: "sleep_stream" })).toThrow();
  });

  it("accepts a standard story session", () => {
    expect(createSessionSchema.parse({ deviceId: "room", profileId: "child", mode: "story" }).mode).toBe("story");
  });

  it("rejects unknown device events", () => {
    expect(() =>
      deviceEventSchema.parse({
        eventId: "evt-1",
        deviceId: "room",
        bootId: "boot-1",
        sessionId: null,
        occurredAt: new Date().toISOString(),
        name: "unknown.event",
        payload: {},
      }),
    ).toThrow();
  });
});
