export const metadata = {
  title: "Pricing – Root Health Ops",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-4xl px-6 py-24 space-y-12">
        <h1 className="text-4xl font-semibold">Pricing</h1>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="rounded-3xl border border-white/10 p-6">
            <h2 className="font-semibold text-xl">Solo</h2>
            <p className="text-slate-400 mt-2">£49 / month</p>
          </div>

          <div className="rounded-3xl border border-emerald-400/30 p-6">
            <h2 className="font-semibold text-xl">Growth</h2>
            <p className="text-slate-400 mt-2">£99 / month</p>
          </div>

          <div className="rounded-3xl border border-white/10 p-6">
            <h2 className="font-semibold text-xl">Practice</h2>
            <p className="text-slate-400 mt-2">£199 / month</p>
          </div>
        </div>
      </section>
    </main>
  );
}
