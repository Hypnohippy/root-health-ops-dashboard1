// app/oauth/linkedin/finish/page.tsx
import LinkedInFinishClient from "./linkedin-finish-client";

export default function LinkedInFinishPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const token =
    typeof searchParams.token === "string" ? searchParams.token : "";
  const state =
    typeof searchParams.state === "string" ? searchParams.state : "";

  return <LinkedInFinishClient token={token} state={state} />;
}
