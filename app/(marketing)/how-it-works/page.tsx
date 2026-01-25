export const metadata = {
  title: "How Root Health Ops Works",
};

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-3xl px-6 py-24 space-y-10">
        <h1 className="text-4xl font-semibold">How it works</h1>

        <ol className="space-y-6 text-slate-300">
          <li>
            <strong className="text-slate-100">1. Join calmly</strong><br />
            No pressure setup. Start where you are.
          </li>
          <li>
            <strong className="text-slate-100">2. Stay organised</strong><br />
            Your content, visibility, and practice presence in one place.
          </li>
          <li>
            <strong className="text-slate-100">3. Grow gently</strong><br />
            Tools that work in the background while you focus on clients.
          </li>
        </ol>
      </section>
    </main>
  );
}
