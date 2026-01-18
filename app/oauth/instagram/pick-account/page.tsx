// app/oauth/instagram/pick-account/page.tsx
import PickInstagramAccountClient from "./pick-instagram-account-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PickInstagramAccountPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const token =
    typeof searchParams.token === "string" ? searchParams.token : "";

  // NOTE: we intentionally ignore `state` here because the client component
  // does not need it (and passing it breaks the build).
  return <PickInstagramAccountClient token={token} />;
}
