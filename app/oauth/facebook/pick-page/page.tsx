// app/oauth/facebook/pick-page/page.tsx
import PickFacebookPageClient from "./pick-facebook-page-client";

export const dynamic = "force-dynamic"; // ✅ prevents Next from prerendering at build time
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

  return <PickFacebookPageClient token={token} state={state} />;
}
