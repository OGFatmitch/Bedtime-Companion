import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bedtime Companion POC",
  description: "A local family bedtime companion",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header>
            <Link href="/">
              <span className="text-2xl font-extrabold">✦ Bedtime Companion</span>{" "}
              <span className="pill">LOCAL POC</span>
            </Link>
            <nav className="nav">
              <Link href="/">Dashboard</Link>
              <Link href="/session/new">Device test</Link>
              <Link href="/profiles">Profiles</Link>
              <Link href="/story/new">New story</Link>
              <Link href="/sleep-stream/new">Sleep Stream</Link>
              <Link href="/worlds">Story worlds</Link>
              <Link href="/devices">Devices</Link>
              <Link href="/settings">Settings</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
