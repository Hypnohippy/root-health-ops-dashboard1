// app/oauth/facebook/pick-page/page.tsx
"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import PickFacebookPageClient from "./pick-facebook-page-client";

export default function PickFacebookPage() {
  return <PickFacebookPageClient />;
}
