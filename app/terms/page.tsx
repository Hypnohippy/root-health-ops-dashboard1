// app/terms/page.tsx
import React from "react";

export const runtime = "nodejs";

export default function TermsPage() {
  // IMPORTANT: Must match TikTok's verification string EXACTLY
  const tiktokVerify =
    "tiktok-developers-site-verification=KyXjC1tFbrMIqwbu55pu6UjTLvHReUIl";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
        {/* TikTok verification: present in HTML, hidden visually */}
        <div style={{ display: "none" }}>{tiktokVerify}</div>

        <h1 className="text-2xl md:text-3xl font-semibold">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-300">
          Effective date: {new Date().toISOString().slice(0, 10)}
        </p>

        <section className="mt-8 space-y-4 text-sm text-slate-200">
          <p>
            These Terms of Service (“Terms”) govern your access to and use of Root Health Ops
            (“Root Health Ops”, “we”, “us”, “our”), including our website, dashboard, and related
            services (the “Service”). By using the Service, you agree to these Terms.
          </p>

          <h2 className="text-lg font-semibold mt-6">1) Who we are</h2>
          <p>
            Root Health Ops is a platform that helps organisations plan, draft, and publish content
            across connected social channels (e.g., Facebook, Instagram, LinkedIn, Threads, etc.),
            and manage related workflows (e.g., drafts, campaigns, sequences).
          </p>

          <h2 className="text-lg font-semibold mt-6">2) Eligibility</h2>
          <p>
            You must be at least 18 years old and able to form a binding contract to use the Service.
            If you use the Service on behalf of an organisation, you represent that you have authority
            to bind that organisation to these Terms.
          </p>

          <h2 className="text-lg font-semibold mt-6">3) Accounts and access</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>
              You must provide accurate information and keep it updated, including billing details
              if you purchase a subscription.
            </li>
          </ul>

          <h2 className="text-lg font-semibold mt-6">4) Connected social accounts</h2>
          <p>
            The Service may allow you to connect third-party accounts (e.g., Meta, LinkedIn, TikTok,
            Threads). You authorise us to access and use those connections only to provide the Service
            features you choose (e.g., publishing content you submit).
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Third-party platforms have their own rules. Your use of them is governed by their terms.
            </li>
            <li>
              Platform permissions may change or require review/approval. We cannot guarantee ongoing
              availability of any third-party feature.
            </li>
          </ul>

          <h2 className="text-lg font-semibold mt-6">5) Acceptable use</h2>
          <p>You agree not to use the Service to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>break laws or regulations;</li>
            <li>infringe intellectual property rights;</li>
            <li>post or distribute harmful, abusive, hateful, or misleading content;</li>
            <li>send spam or run deceptive campaigns;</li>
            <li>attempt to access or disrupt systems or data you’re not authorised to access.</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6">6) Content</h2>
          <p>
            You retain ownership of content you create and upload. You grant us a limited license to
            host, process, and transmit your content solely to provide the Service (including posting
            to third-party platforms at your direction).
          </p>

          <h2 className="text-lg font-semibold mt-6">7) AI features</h2>
          <p>
            The Service may include AI-assisted drafting tools. AI output may be inaccurate. You are
            responsible for reviewing content before publishing.
          </p>

          <h2 className="text-lg font-semibold mt-6">8) Subscriptions and billing</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Paid plans (if enabled) renew automatically unless cancelled.</li>
            <li>Fees are non-refundable except where required by law.</li>
            <li>We may change pricing with reasonable notice.</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6">9) Availability and changes</h2>
          <p>
            We may modify, suspend, or discontinue parts of the Service, including features dependent
            on third-party platforms. We aim to provide a reliable service but do not guarantee
            uninterrupted availability.
          </p>

          <h2 className="text-lg font-semibold mt-6">10) Disclaimers</h2>
          <p>
            The Service is provided “as is” and “as available.” To the fullest extent permitted by law,
            we disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement.
          </p>

          <h2 className="text-lg font-semibold mt-6">11) Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, Root Health Ops will not be liable for indirect,
            incidental, special, consequential, or punitive damages, or any loss of profits, data,
            or goodwill resulting from your use of the Service.
          </p>

          <h2 className="text-lg font-semibold mt-6">12) Termination</h2>
          <p>
            You may stop using the Service at any time. We may suspend or terminate access if you breach
            these Terms or if required to comply with law or platform policies.
          </p>

          <h2 className="text-lg font-semibold mt-6">13) Contact</h2>
          <p>
            For support or legal questions, contact us via the support channel provided in the app.
          </p>
        </section>
      </div>
    </main>
  );
}
