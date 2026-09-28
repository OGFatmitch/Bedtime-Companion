"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Child = { id: string; name: string };

function progressMessage(seconds: number) {
  if (seconds < 3) return "Connecting to the storyteller…";
  if (seconds < 12) return "Drafting a cozy story and shaping the scenes…";
  if (seconds < 25) return "Reviewing the story against bedtime safety rules…";
  if (seconds < 45) return "Still working—generation can take a little longer during busy periods…";
  return "This is taking longer than usual, but the request is still active…";
}

export default function NewStory() {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/profiles").then((response) => response.json()).then(setChildren).catch(() => setError("Could not load child profiles."));
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [loading]);

  const status = useMemo(() => progressMessage(seconds), [seconds]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSeconds(0);
    setError("");
    controller.current = new AbortController();
    try {
      const response = await fetch("/api/story", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": crypto.randomUUID() },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
        signal: controller.current.signal,
      });
      const body = await response.json();
      if (response.ok && body.id) {
        router.push(`/story/${body.id}`);
        return;
      }
      const message = body.error?.message ?? "Story generation failed.";
      const requestId = body.error?.requestId ?? body.requestId;
      setError(`${message}${requestId ? ` Request ID: ${requestId}` : ""}`);
    } catch (requestError) {
      if ((requestError as Error).name === "AbortError") setError("Story generation was cancelled.");
      else setError("The request could not reach the server. Check that the server is running and try again.");
    } finally {
      setLoading(false);
      controller.current = null;
    }
  }

  function cancel() {
    controller.current?.abort();
  }

  return (
    <form onSubmit={submit} className="card max-w-2xl" aria-busy={loading}>
      <h1>Make tonight&apos;s story</h1>
      <fieldset disabled={loading} className="contents">
        <label className="label">
          Who is listening?
          <select className="select" name="childId">
            {children.map((child) => <option value={child.id} key={child.id}>{child.name}</option>)}
          </select>
        </label>
        <label className="label">
          Story mode
          <select className="select" name="mode">
            {["Cozy Bedtime Story", "Silly Bedtime Story", "Sick Day Comfort Story", "Mommy/Daddy Story", "Custom Prompt", "Persistent Story World / Continue Story"].map((mode) => <option key={mode}>{mode}</option>)}
          </select>
        </label>
        <label className="label">
          Your spark
          <textarea name="prompt" className="textarea" maxLength={1_000} placeholder="A cozy soup sleepover with a brave little kitten…" />
        </label>
        <label className="label">
          Tone
          <input name="tone" className="input" maxLength={300} placeholder="Use profile tone by default" />
        </label>
        <label className="label">
          Minutes
          <select className="select" name="minutes">
            <option value="6">5–6 minutes</option>
            <option value="8">6–8 minutes</option>
          </select>
        </label>
      </fieldset>

      <div className="warning">Private local-testing note: commercial products should avoid generating or marketing unlicensed copyrighted characters without legal review or licensing.</div>

      {loading && (
        <section className="progress-panel" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <div>
            <strong>Writing by moonlight… {seconds}s</strong>
            <p className="muted">{status}</p>
          </div>
        </section>
      )}
      {error && <p className="warning" role="alert">{error}</p>}

      <div className="flex gap-2 mt-4">
        <button className="btn" disabled={loading || children.length === 0}>
          {loading ? "Generating…" : "Generate story"}
        </button>
        {loading && <button className="btn alt" type="button" onClick={cancel}>Cancel</button>}
      </div>
    </form>
  );
}

