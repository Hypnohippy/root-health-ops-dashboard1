// app/oauth/facebook/pick-page/page.tsx
import dynamic from "next/dynamic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ✅ Client-only render to avoid prerender/build-time searchParams issues
const PickFacebookPageClient = dynamic(() => import("./pick-facebook-page-client"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          Loading Facebook Page picker…
        </div>
      </div>
    </div>
  ),
});

export default function PickFacebookPage() {
  return <PickFacebookPageClient />;
}
