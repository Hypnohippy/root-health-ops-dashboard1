// app/oauth/threads/finish/page.tsx
import ThreadsFinishClient from "./threads-finish-client";

export default function ThreadsFinishPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const token =
    typeof searchParams.token === "string" ? searchParams.token : "";
  const state =
    typeof searchParams.state === "string" ? searchParams.state : "";

  return <ThreadsFinishClient token={token} state={state} />;
}
