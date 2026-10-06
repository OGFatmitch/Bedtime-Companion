import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [storyCount, devices, feedback, recentStories, metrics] = await Promise.all([
    prisma.story.count(),
    prisma.deviceNode.findMany({ include: { assignedChild: true } }),
    prisma.sessionFeedback.findMany({ take: 5, orderBy: { createdAt: "desc" }, include: { child: true } }),
    prisma.story.findMany({ take: 5, orderBy: { createdAt: "desc" }, include: { child: { select: { name: true } }, _count: { select: { audioChunks: true } } } }),
    Promise.all([
      prisma.audioChunk.count(), prisma.sleepStream.count(), prisma.sessionFeedback.count({ where: { askedForOneMore: true } }),
      prisma.story.count({ where: { isFavorite: true } }), prisma.sessionFeedback.aggregate({ _avg: { parentRating: true } }),
    ]),
  ]);
  return <main><p className="muted">A private little laboratory for the question: <i>will they ask for it again?</i></p>
    <div className="grid md:grid-cols-3">{[["Stories generated", storyCount], ["Stories narrated", metrics[0]], ["Sleep Streams", metrics[1]], ["One mores", metrics[2]], ["Favorites", metrics[3]], ["Average rating", metrics[4]._avg.parentRating?.toFixed(1) || "—"]].map(([label, value]) => <div className="card" key={String(label)}><div className="muted">{label}</div><div className="metric">{String(value)}</div></div>)}</div>
    <div className="grid md:grid-cols-2 mt-5"><section className="card"><h2>Tonight’s quick start</h2><div className="grid"><Link className="btn" href="/stories">▶ Choose a story</Link><Link className="btn alt" href="/story/new">✦ Make a bedtime story</Link><Link className="btn alt" href="/session/new">↔ Test the device protocol</Link><Link className="btn alt" href="/sleep-stream/new">☾ Start a Sleep Stream</Link></div></section><section className="card"><h2>Bedroom nodes</h2>{devices.map((device) => <div key={device.id} className="flex justify-between py-2"><span>{device.name}<small className="block muted">{device.location} · {device.assignedChild?.name || "Unassigned"}</small></span><Link className="pill" href="/devices">Manage</Link></div>)}</section></div>
    <section className="card mt-5"><div className="flex justify-between items-center"><h2>Recent stories</h2><Link className="pill" href="/stories">View all</Link></div>{recentStories.length ? recentStories.map((story) => <Link className="recent-row" href={`/story/${story.id}`} key={story.id}><span><strong>{story.title}</strong><small className="block muted">For {story.child.name} · {story._count.audioChunks ? "Narrated" : "Text only"}</small></span><span>Open →</span></Link>) : <p className="muted">No stories yet.</p>}</section>
    <section className="card mt-5"><h2>Recent family signals</h2>{feedback.length ? feedback.map((item) => <p key={item.id}>{item.child.name}: {item.askedForOneMore ? "asked for one more ✦ " : ""}{item.parentRating ? `${item.parentRating}/5` : ""} <span className="muted">{item.notes}</span></p>) : <p className="muted">No feedback yet. A tiny bit of honest feedback after each session is the whole point of this POC.</p>}</section>
  </main>;
}
