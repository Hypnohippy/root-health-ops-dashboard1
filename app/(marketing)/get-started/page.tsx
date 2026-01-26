// app/(marketing)/get-started/page.tsx
import Link from "next/link";
import React from "react";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
      {children}
    </span>
  );
}

function Step({
  num,
  title,
  body,
}: {
  num: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/80 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/30">
          {num}
        </div>
        <div>
          <div className="text-base font-semibold text-slate-50">{title}</div>
          <div className="mt-2 text-sm leading-relaxed text-slate-300">{body}</div>
        </div>
      </div>
    </div>
  );
}

export default function GetStartedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-12">
        <section className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Pill>Set up once</Pill>
            <Pill>Calm visibility</Pill>
            <Pill>Cancel anytime</Pill>
          </div>

          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
            Get started in minutes
          </h1>

          <p className="max-w-3xl text-base md:text-lg text-slate-300 leading-relaxed">
            Root Health Ops is designed to reduce overwhelm. You connect your channels once,
            create a post (or a series), schedule it, and the platform keeps your visibility
            steady while you focus on clients.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/connect"
              className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
            >
              Start setup
            </Link>

            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              See how it works
            </Link>
          </div>

          <div className="text-[12px] text-slate-400">
            Already have an account?{" "}
            <Link href="/dashboard" className="text-slate-200 underline underline-offset-4">
              Sign in
            </Link>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Step
            num="1"
            title="Connect your channels"
            body={
              <>
                Go to <span className="text-slate-50 font-semibold">Connect</span> and link the platforms
                you want to post to (LinkedIn / Facebook / Instagram / Threads, etc.).
              </>
            }
          />
          <Step
            num="2"
            title="Create a post (or a story series)"
            body={
              <>
                Use Stories to generate a high-quality post, edit it, then choose{" "}
                <span className="text-slate-50 font-semibold">Post now</span> or{" "}
                <span className="text-slate-50 font-semibold">Schedule</span>.
              </>
            }
          />
          <Step
            num="3"
            title="Let the scheduler handle the rest"
            body={
              <>
                Scheduled posts are dispatched automatically. Your queue shows clear status like{" "}
                <span className="text-slate-50 font-semibold">scheduled</span>,{" "}
                <span className="text-slate-50 font-semibold">sent</span>, or{" "}
                <span className="text-slate-50 font-semibold">failed</span>.
              </>
            }
          />
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 md:p-10">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div>
              <div className="text-2xl md:text-3xl font-semibold tracking-tight">
                Your “final guardrail” is pricing
              </div>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                We keep public pages simple. When someone is ready, they review pricing and then
                go through setup.
              </p>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                Want to sanity-check the journey? It should feel like:{" "}
                <span className="text-slate-50 font-semibold">
                  Landing → How it works → Pricing → Get started → Dashboard
                </span>
                .
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                >
                  View pricing
                </Link>
                <Link
                  href="/colleges"
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
                >
                  Colleges route →
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
              <div className="text-sm font-semibold text-slate-50">
                Quick checklist
              </div>
              <ul className="mt-3 space-y-2 text-sm text-slate-300 leading-relaxed">
                <li>• Connect socials once</li>
                <li>• Generate/edit post</li>
                <li>• Schedule</li>
                <li>• Scheduler dispatches automatically</li>
                <li>• Queue shows status + errors if any</li>
              </ul>
              <div className="mt-4 text-[11px] text-slate-500">
                This page is intentionally lightweight and human — not a feature dump.
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 pt-8 pb-10 text-[12px] text-slate-400">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>© {new Date().getFullYear()} Root Health Ops</div>
            <div className="flex flex-wrap gap-3">
              <Link href="/" className="hover:text-slate-200">
                Home
              </Link>
              <Link href="/how-it-works" className="hover:text-slate-200">
                How it works
              </Link>
              <Link href="/pricing" className="hover:text-slate-200">
                Pricing
              </Link>
              <Link href="/colleges" className="hover:text-slate-200">
                Colleges
              </Link>
              <Link href="/dashboard" className="hover:text-slate-200">
                Dashboard
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

