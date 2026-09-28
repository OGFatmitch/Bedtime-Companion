const transitions: Record<string, ReadonlySet<string>> = {
  CREATED: new Set(["PREPARING", "STOPPING", "ERROR"]),
  PREPARING: new Set(["READY", "STOPPING", "ERROR"]),
  READY: new Set(["PLAYING", "STOPPING", "ERROR"]),
  PLAYING: new Set(["PAUSED", "INTERACTING", "COMPLETED", "STOPPING", "ERROR"]),
  PAUSED: new Set(["PLAYING", "STOPPING", "ERROR"]),
  INTERACTING: new Set(["PLAYING", "STOPPING", "ERROR"]),
  STOPPING: new Set(["STOPPED", "ERROR"]),
  STOPPED: new Set(),
  COMPLETED: new Set(),
  ERROR: new Set(),
};

export function canTransition(from: string, to: string) {
  return transitions[from]?.has(to) ?? false;
}

export function assertTransition(from: string, to: string) {
  if (!canTransition(from, to)) throw new Error(`Invalid session transition: ${from} -> ${to}`);
}

