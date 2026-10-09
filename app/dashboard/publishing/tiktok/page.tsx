import AuditComposer from "./AuditComposer";
export default function TikTokPage() {
  if (process.env.TIKTOK_DIRECT_POST_AUDIT_ENABLED === "1") return <AuditComposer />;
  return <main className="p-6"><h1>TikTok publishing</h1><p>Direct Post is disabled pending audit. Use Publishing to upload your video to TikTok, then finish the public post in your TikTok inbox.</p><a href="/dashboard/publishing">Open Publishing</a></main>;
}
