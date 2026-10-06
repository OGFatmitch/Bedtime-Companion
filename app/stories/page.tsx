import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const stories = await prisma.story.findMany({
    include: { child: { select: { name: true } }, _count: { select: { scenes: true, audioChunks: true } } },
    orderBy: { createdAt: "desc" },
  });
  return <main><div className="flex justify-between items-center gap-3 flex-wrap"><div><h1>Story library</h1><p className="muted">Open, narrate, or send any previous story back to the bedside.</p></div><Link className="btn" href="/story/new">New story</Link></div><div className="grid md:grid-cols-2 mt-5">{stories.map((story) => <Link className="card story-card" href={`/story/${story.id}`} key={story.id}><div className="flex justify-between gap-2"><span className="pill">{story.mode}</span><span className="muted">{story.createdAt.toLocaleDateString()}</span></div><h2>{story.title}</h2><p className="muted">For {story.child.name} · {story._count.scenes} scenes · {story._count.audioChunks ? "Narrated" : "Text only"}</p><span className="story-link">Open story →</span></Link>)}{!stories.length && <section className="card"><p className="muted">No stories yet.</p></section>}</div></main>;
}
