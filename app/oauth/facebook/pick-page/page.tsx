// app/oauth/facebook/pick-page/page.tsx
import PickFacebookPageClient from "./pick-facebook-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PickFacebookPagePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const token =
    typeof searchParams.token === "string" ? searchParams.token : "";
  const state =
    typeof searchParams.state === "string" ? searchParams.state : "";

  // ✅ If someone arrives here without token, we MUST not “quick connect”
  // because we can’t fetch page tokens without the user token.
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
          <h1 className="text-2xl font-semibold">Pick your Facebook Page</h1>
          <p className="mt-2 text-sm text-slate-300">
            Missing token — please go back and click <b>Connect Facebook</b> again.
          </p>

          <div className="mt-6">
            <a
              href="/dashboard/connect"
              className="inline-flex rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Back to Connect
            </a>
          </div>

          <div className="mt-6 text-xs text-slate-400">
            If you landed here directly (bookmark / refresh), it won’t work — this
            page needs the token that comes from the Facebook OAuth callback.
          </div>
        </div>
      </div>
    );
  }

  return <PickFacebookPageClient token={token} state={state} />;
}
