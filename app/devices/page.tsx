import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DeviceVolumeControl } from "@/components/DeviceVolumeControl";

export const dynamic = "force-dynamic";

function readVolume(json: string) {
  try {
    const value = Number((JSON.parse(json) as { volume?: unknown }).volume);
    return Number.isFinite(value) ? Math.min(70, Math.max(0, value)) : 45;
  } catch {
    return 45;
  }
}

function online(lastSeenAt: Date | null) {
  return Boolean(lastSeenAt && Date.now() - lastSeenAt.getTime() < 30_000);
}

export default async function Devices() {
  const devices = await prisma.deviceNode.findMany({
    include: {
      assignedChild: true,
      sessions: { take: 1, orderBy: { createdAt: "desc" }, select: { id: true, state: true } },
      events: { take: 5, orderBy: { occurredAt: "desc" }, select: { id: true, name: true, occurredAt: true } },
      commands: { take: 1, orderBy: { sequence: "desc" }, select: { sequence: true, acknowledgedAt: true } },
    },
    orderBy: { name: "asc" },
  });
  return <main><h1>Bedroom nodes</h1><p className="muted">Live health, playback controls, and recent device activity.</p><div className="grid md:grid-cols-2">{devices.map((device) => {
    const isOnline = online(device.lastSeenAt); const latestSession = device.sessions[0]; const latestCommand = device.commands[0];
    return <section className="card" key={device.id}>
      <div className="flex justify-between gap-2"><div><span className={`pill ${isOnline ? "status-online" : "status-offline"}`}>{isOnline ? "ONLINE" : "OFFLINE"}</span><h2>{device.name}</h2><p>{device.location} · {device.assignedChild?.name || "Unassigned"}</p></div><Link className="btn alt self-start" href={`/device/${device.id}`}>Legacy display</Link></div>
      <div className="health-grid"><div><span className="muted">Last seen</span><strong>{device.lastSeenAt?.toLocaleTimeString() || "Never"}</strong></div><div><span className="muted">Client</span><strong>{device.clientVersion || "Unknown"}</strong></div><div><span className="muted">Latest session</span><strong>{latestSession?.state || "None"}</strong></div><div><span className="muted">Command</span><strong>{latestCommand ? `#${latestCommand.sequence} ${latestCommand.acknowledgedAt ? "✓" : "pending"}` : "None"}</strong></div></div>
      <DeviceVolumeControl deviceId={device.id} initialVolume={readVolume(device.lastStateJson)} />
      <details className="mt-4"><summary>Recent device activity</summary>{device.events.length ? device.events.map((event) => <p key={event.id} className="activity-row"><span>{event.name}</span><time>{event.occurredAt.toLocaleTimeString()}</time></p>) : <p className="muted">No device events yet.</p>}</details>
    </section>;
  })}</div></main>;
}
