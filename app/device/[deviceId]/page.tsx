"use client";

import { use, useEffect, useRef, useState } from "react";

type QueueItem = { audioUrl: string };
type Queue = { title: string; childName: string; itemsJson: string };

export default function BrowserDevice({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = use(params);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const poll = async () => {
      const response = await fetch(`/api/device/${deviceId}`);
      if (response.ok) setQueue((await response.json()).queue);
    };
    void poll();
    const timer = setInterval(poll, 5_000);
    return () => clearInterval(timer);
  }, [deviceId]);

  const items = queue ? (JSON.parse(queue.itemsJson) as QueueItem[]) : [];
  return (
    <main className="device">
      <span className="pill">LEGACY BROWSER SIMULATOR</span>
      <h1>{queue?.title ?? "Waiting for a story…"}</h1>
      <p className="text-xl text-indigo-200">{queue?.childName ?? "Use Device test for the new Pi protocol."}</p>
      {items[itemIndex] && (
        <audio
          ref={audio}
          src={items[itemIndex].audioUrl}
          onEnded={() => setItemIndex((current) => Math.min(current + 1, items.length - 1))}
        />
      )}
      <div className="controls mt-10">
        <button className="btn" onClick={() => audio.current?.play()}>▶ Play</button>
        <button className="btn alt" onClick={() => audio.current?.pause()}>Ⅱ Pause</button>
        <button className="btn alt" onClick={() => { if (audio.current) { audio.current.pause(); audio.current.currentTime = 0; } }}>■ Stop</button>
      </div>
      <p className="muted mt-8">This page is retained as a development-only browser simulator.</p>
    </main>
  );
}

