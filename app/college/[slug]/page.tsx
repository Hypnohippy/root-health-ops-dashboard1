import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type CohortRow = {
  id: string;
  college_name: string;
  cohort_name: string;
  cohort_code: string;
  slug: string | null;
  discount_percent: number | null;
  discount_months: number | null;
  max_redemptions: number | null;
  redemptions_used: number | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean | null;
  notes: string | null;
  stripe_coupon_id: string | null;
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
      {children}
    </span>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-slate-300">
      <span className="mt-[7px] inline-block h-1.5 w-1.5 rounded-full bg-emerald-300/90" />
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

async function loadCohortBySlug(slug: string): Promise<CohortRow | null> {
  const cleanSlug = String(slug || "").trim().toLowerCase();
  if (!cleanSlug) return null;

  const { data, error } = await supabaseAdmin
    .from("college_cohorts")
    .select("*")
    .eq("slug", cleanSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[college slug page] failed to load cohort", error);
    return null;
  }

  if (!data) return null;

  const now = new Date();
  const startsAt = data.starts_at ? new Date(data.starts_at) : null;
  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;

  if (startsAt && startsAt > now) return null;
  if (expiresAt && expiresAt < now) return null;

  return data as CohortRow;
}

export default async function CollegeLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cohort = await loadCohortBySlug(slug);

  if (!cohort) {
    notFound();
  }

  const seatsUsed =
    typeof cohort.redemptions_used === "number" ? cohort.redemptions_used : 0;
  const maxSeats =
    typeof cohort.max_redemptions === "number" ? cohort.max_redemptions : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-14">
      <section className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Pill>{cohort.college_name}</Pill>
          <Pill>{cohort.cohort_name}</Pill>
          <Pill>Supported start</Pill>
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] text-slate-50">
          Your supported cohort enrolment
        </h1>

        <p className="max-w-3xl text-base md:text-lg text-slate-300 leading-relaxed">
          This private page has been prepared for{" "}
          <span className="font-semibold text-slate-100">
            {cohort.college_name}
          </span>
          . If you are part of{" "}
          <span className="font-semibold text-slate-100">
            {cohort.cohort_name}
          </span>
          , you can continue to your supported-start enrolment below.
        </p>

        <div className="rounded-[32px] border border-emerald-400/30 bg-gradient-to-br from-emerald-400/12 via-white/5 to-white/5 p-6 md:p-8">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-emerald-200/90">
            Your cohort code
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">
            {cohort.cohort_code}
          </div>
          <div className="mt-3 text-sm text-slate-300 leading-relaxed">
            Your discount is applied privately at checkout when you continue
            through the cohort route.
          </div>

          <ul className="mt-6 space-y-3">
            <Bullet>
              {cohort.discount_percent || 50}% off for{" "}
              {cohort.discount_months || 6} months
            </Bullet>
            <Bullet>Built for supported student / early-career starts</Bullet>
            <Bullet>Simple enrolment with no public promo-code hunting</Bullet>
            <Bullet>
              {maxSeats !== null
                ? `${seatsUsed} of ${maxSeats} seats used so far`
                : "Seat usage is managed privately by your provider"}
            </Bullet>
          </ul>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={`/cohort?code=${encodeURIComponent(
                cohort.cohort_code
              )}&plan=growth`}
              className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
            >
              Continue with Growth
            </Link>

            <Link
              href={`/cohort?code=${encodeURIComponent(cohort.cohort_code)}`}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Choose a different plan
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <div className="text-sm font-semibold text-slate-50">
            Why this exists
          </div>
          <div className="mt-3 text-sm text-slate-300 leading-relaxed">
            Many students and newly qualified clinicians feel stuck at the point
            where they need to become visible. This route reduces friction and
            gives you a calmer supported start.
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <div className="text-sm font-semibold text-slate-50">
            What happens next
          </div>
          <div className="mt-3 text-sm text-slate-300 leading-relaxed">
            You choose your plan, continue to checkout, and your approved cohort
            support is applied automatically if your code is valid.
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <div className="text-sm font-semibold text-slate-50">
            Need the public route instead?
          </div>
          <div className="mt-3 text-sm text-slate-300 leading-relaxed">
            If you were sent here by mistake, you can still view the standard
            pricing page and public information below.
          </div>
          <div className="mt-5">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              View public pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
