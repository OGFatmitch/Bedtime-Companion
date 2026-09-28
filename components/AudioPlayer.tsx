"use client";

import { useState } from "react";

export function AudioPlayer({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState(0);
  if (!urls.length) return null;
  return (
    <audio
      key={urls[index]}
      controls
      autoPlay={index > 0}
      className="w-full"
      src={urls[index]}
      onEnded={() => setIndex((current) => Math.min(current + 1, urls.length - 1))}
    />
  );
}
