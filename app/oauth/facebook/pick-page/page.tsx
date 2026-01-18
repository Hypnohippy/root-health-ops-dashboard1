import PickFacebookPageClient from "./pick-facebook-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PickFacebookPagePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const state =
    typeof searchParams?.state === "string" ? searchParams?.state : "";

  return <PickFacebookPageClient state={state} />;
}
