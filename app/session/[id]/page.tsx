"use client";

import { use, useEffect, useState } from "react";

type Snapshot = {
  state: string;
  mode: string;
  requestedTheme: string;
  device: { name: string; lastSeenAt: string | null };
  profile: { name: string };
  items: Array<{ id: string; position: number; status: string; type: string }>;
  errorMessage?: string | null;
};

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const response = await fetch(`/api/v1/sessions/${id}`, { cache: "no-store" });
      const body = await response.json();
      if (!active) return;
      if (response.ok) setSession(body.session);
      else setError(body.error?.message ?? "Could not load session.");
    };
    void poll();
    const timer = setInterval(poll, 2_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);

  async function action(name: "pause" | "resume" | "stop" | "one_more") {
    setPendingAction(name);
    setError("");
    const response = await fetch(`/api/v1/sessions/${id}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: name }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error?.message ?? `Could not ${name.replace("_", " ")}.`);
    setPendingAction(null);
  }

  if (error && !session) return <main className="warning">{error}</main>;
  if (!session) return <main className="card">Loading session…</main>;
  return (
    <main className="grid gap-5">
      <section className="card">
        <span className="pill">{session.state}</span>
        <h1>{session.profile.name}&apos;s device session</h1>
        <p>{session.device.name} · {session.mode}</p>
        <p className="muted">{session.requestedTheme || "Connection test"}</p>
        <div className="flex gap-2 flex-wrap mt-4">
          <button className="btn alt" disabled={session.state !== "PLAYING" || Boolean(pendingAction)} onClick={() => action("pause")}>{pendingAction === "pause" ? "Pausing…" : "Pause"}</button>
          <button className="btn alt" disabled={session.state !== "PAUSED" || Boolean(pendingAction)} onClick={() => action("resume")}>{pendingAction === "resume" ? "Resuming…" : "Resume"}</button>
          <button className="btn alt" disabled={!(["COMPLETED", "STOPPED"].includes(session.state)) || Boolean(pendingAction)} onClick={() => action("one_more")}>{pendingAction === "one_more" ? "Adding…" : "One more"}</button>
          <button className="btn" disabled={!(["CREATED", "PREPARING", "READY", "PLAYING", "PAUSED", "INTERACTING"].includes(session.state)) || Boolean(pendingAction)} onClick={() => action("stop")}>{pendingAction === "stop" ? "Stopping…" : "Stop"}</button>
        </div>
        {error && <p className="warning" role="alert">{error}</p>}
        {session.errorMessage && <p className="warning">{session.errorMessage}</p>}
      </section>
      <section className="card">
        <h2>Queue</h2>
        {session.items.map((item) => (
          <p key={item.id}>#{item.position + 1} · {item.type} <span className="pill">{item.status}</span></p>
        ))}
      </section>
    </main>
  );
}
