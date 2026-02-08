// app/oauth/facebook/pick-page/page.tsx

export const dynamic = "force-dynamic";
export const revalidate = 0;

import PickFacebookPageClient from "./pick-facebook-page-client";

export default function PickFacebookPage() {
  return <PickFacebookPageClient />;
}
