import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./sessionState";

describe("session state", () => {
  it("allows the standard preparation path", () => {
    expect(canTransition("CREATED", "PREPARING")).toBe(true);
    expect(canTransition("PREPARING", "READY")).toBe(true);
  });

  it("does not replay a completed session", () => {
    expect(canTransition("COMPLETED", "PLAYING")).toBe(false);
    expect(() => assertTransition("COMPLETED", "PLAYING")).toThrow();
  });
});

