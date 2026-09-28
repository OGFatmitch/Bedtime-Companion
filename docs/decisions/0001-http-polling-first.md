# 0001 — HTTP polling before WebSocket delivery

## Decision

Implement the canonical command/event semantics over authenticated HTTP polling first. Add WebSocket delivery only after the simulator and physical Pi reliably reconcile commands, events, cache state, and restarts.

## Why

Polling is easier to inspect during hardware bring-up and exercises the same sequence, acknowledgement, idempotency, snapshot, and media contracts. WebSocket will later be a lower-latency transport rather than a second behavioral system.

## Consequences

The idle simulator currently polls every two seconds. This is acceptable for one home node but is not the final latency or efficiency target.

