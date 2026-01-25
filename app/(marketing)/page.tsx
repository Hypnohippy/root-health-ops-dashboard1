export const metadata = {
  title: "Root Health Ops",
  description: "Run your practice. Grow your impact. Stay human.",
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-4xl px-6 py-24 space-y-10">
        <h1 className="text-4xl md:text-5xl font-semibold leading-tight">
          Run your practice.  
          <br />
          Grow your impact.  
          <br />
          Stay human.
        </h1>

        <p className="text-lg text-slate-300 max-w-2xl">
          Root Health Ops is a calm, supportive platform built for therapists
          and clinicians who want their work to grow without burnout,
          pressure, or sales tactics.
        </p>

        <div className="flex flex-wrap gap-4 pt-4">
          <a
            href="/how-it-works"
            className="rounded-full bg-emerald-500 px-6 py-3 text-slate-950 font-semibold"
          >
            How it works
          </a>

          <a
            href="/pricing"
            className="rounded-full border border-white/20 px-6 py-3 text-slate-100"
          >
            View pricing
          </a>
        </div>
      </section>
    </main>
  );
}
