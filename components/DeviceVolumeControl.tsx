"use client";

import { useState } from "react";

export function DeviceVolumeControl({ deviceId, initialVolume }: { deviceId: string; initialVolume: number }) {
  const [volume, setVolume] = useState(initialVolume);
  const [savedVolume, setSavedVolume] = useState(initialVolume);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus("Sending…");
    const response = await fetch(`/api/v1/devices/${deviceId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "volume.set", percent: volume }),
    });
    const body = await response.json();
    if (response.ok) {
      setSavedVolume(volume);
      setStatus("Volume sent to bedside");
    } else {
      setStatus(body.error?.message ?? "Could not update volume.");
    }
    setSaving(false);
  }

  return (
    <div className="mt-4">
      <div className="flex justify-between">
        <label className="label" htmlFor={`volume-${deviceId}`}>Bedside volume</label>
        <strong>{volume}%</strong>
      </div>
      <input
        id={`volume-${deviceId}`}
        className="range"
        type="range"
        min="0"
        max="70"
        step="5"
        value={volume}
        onChange={(event) => setVolume(Number(event.target.value))}
      />
      <div className="flex gap-2 items-center mt-2">
        <button className="btn" type="button" disabled={saving || volume === savedVolume} onClick={save}>
          {saving ? "Sending…" : "Set volume"}
        </button>
        {status && <span className="muted" role="status">{status}</span>}
      </div>
      <p className="muted text-sm">Limited to 70% for the prototype. Changes persist on the Pi.</p>
    </div>
  );
}
