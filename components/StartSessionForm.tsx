"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartSessionForm({
  profiles,
  devices,
}: {
  profiles: Array<{ id: string; name: string }>;
  devices: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setLoading(true);
    setError("");
    const response = await fetch("/api/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        deviceId: formData.get("deviceId"),
        profileId: formData.get("profileId"),
        mode: "story",
        theme: formData.get("theme"),
        interactive: false,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error?.message ?? "Could not start the session.");
      setLoading(false);
      return;
    }
    router.push(`/session/${body.session.id}`);
  }

  return (
    <form action={submit} className="card max-w-xl">
      <span className="pill">DEVICE VERTICAL SLICE</span>
      <h1>Start a connection test</h1>
      <p className="muted">Queues a short, gentle test tone through the authenticated device protocol.</p>
      <label className="label">
        Child
        <select className="select" name="profileId">
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.name}</option>
          ))}
        </select>
      </label>
      <label className="label">
        Bedroom node
        <select className="select" name="deviceId">
          {devices.map((device) => (
            <option key={device.id} value={device.id}>{device.name}</option>
          ))}
        </select>
      </label>
      <label className="label">
        Theme for the eventual story
        <input className="input" name="theme" maxLength={300} placeholder="A cozy moon picnic" />
      </label>
      {error && <p className="warning">{error}</p>}
      <button className="btn mt-4" disabled={loading || !profiles.length || !devices.length}>
        {loading ? "Preparing…" : "Queue connection test"}
      </button>
    </form>
  );
}

