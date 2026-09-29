import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Root Health Ops",
  description:
    "How Root Health Ops collects, uses, stores and protects personal information.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-emerald-300">
              Root Health Ops
            </div>
            <h1 className="mt-2 text-3xl font-semibold">Privacy Policy</h1>
          </div>

          <Link
            href="/"
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Back to home
          </Link>
        </div>

        <p className="mt-4 text-sm text-slate-300">
          Last updated: 29 September 2026
        </p>

        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-200">
          <section>
            <p>
              Root Health Ops (“Root Health Ops”, “we”, “our”, “us”) provides
              software that helps individuals and organisations plan, create,
              manage and publish professional content, manage communications and
              workflows, and connect supported third-party services.
            </p>

            <p className="mt-3">
              This Privacy Policy explains what information we collect, why we
              use it, how it is protected, when it may be shared, and the choices
              and rights available to users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">1. Information we collect</h2>

            <p className="mt-3">Depending on how you use Root Health Ops, we may collect:</p>

            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                account information such as your name, email address,
                organisation and user role;
              </li>
              <li>
                authentication and account identifiers used to sign you in;
              </li>
              <li>
                information you enter into Root Health Ops, including drafts,
                campaigns, scheduled content, notes, resources and workflow
                information;
              </li>
              <li>
                account identifiers supplied by connected services, such as
                user IDs, page IDs, profile IDs, channel IDs or account names;
              </li>
              <li>
                access and refresh tokens required to maintain authorised
                third-party connections;
              </li>
              <li>
                information returned by connected services where the user has
                granted permission for Root Health Ops to access it;
              </li>
              <li>
                technical and operational information such as connection
                status, provider errors, publishing results, timestamps and
                security logs;
              </li>
              <li>
                subscription, billing and plan information where paid services
                are used; and
              </li>
              <li>
                communications sent to us for support, account administration
                or legal enquiries.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Connected third-party services</h2>

            <p className="mt-3">
              Root Health Ops can connect to services such as Facebook,
              Instagram, LinkedIn, Threads, TikTok, Google and other supported
              providers.
            </p>

            <p className="mt-3">
              Connections are made only after the user authorises access through
              the relevant provider. Root Health Ops receives only the
              permissions and information made available through that
              authorisation.
            </p>

            <p className="mt-3">
              Depending on the provider and the permissions granted, Root Health
              Ops may use an authorised connection to perform actions requested
              by the user, such as identifying the connected account, preparing
              content, uploading or publishing content, checking connection
              status, or retrieving supported responses or account information.
            </p>

            <p className="mt-3">
              Third-party platforms operate under their own terms, privacy
              policies, permissions and usage limits. Their services may change,
              restrict or temporarily suspend access independently of Root
              Health Ops.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. TikTok data</h2>

            <p className="mt-3">
              When a user connects TikTok, Root Health Ops may receive TikTok
              account identifiers, profile information made available through
              the approved permissions, access tokens and information required
              to support authorised TikTok functionality.
            </p>

            <p className="mt-3">
              TikTok information is used only to provide features the user has
              chosen to use, such as connecting an account and preparing,
              uploading or publishing supported content.
            </p>

            <p className="mt-3">
              Root Health Ops does not sell TikTok user data. TikTok data is not
              used to build unrelated advertising profiles or sold to data
              brokers.
            </p>

            <p className="mt-3">
              Users may disconnect TikTok from Root Health Ops. They may also
              revoke Root Health Ops access through their TikTok account or
              request deletion of information held by Root Health Ops.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. How we use information</h2>

            <p className="mt-3">We use information to:</p>

            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>create and administer user accounts;</li>
              <li>provide the Root Health Ops service;</li>
              <li>maintain authorised third-party connections;</li>
              <li>perform actions requested by users;</li>
              <li>prepare, schedule, upload or publish supported content;</li>
              <li>display connection, workflow and publishing status;</li>
              <li>provide AI-assisted drafting and workflow features;</li>
              <li>prevent misuse and protect the security of the service;</li>
              <li>diagnose failures and improve reliability;</li>
              <li>provide customer support;</li>
              <li>administer subscriptions and billing; and</li>
              <li>meet legal, regulatory and contractual requirements.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Legal basis for processing</h2>

            <p className="mt-3">
              Where UK GDPR or similar data-protection laws apply, we process
              personal information where necessary to provide our contractual
              service, where the user has given consent, where processing is
              necessary for legitimate business and security interests, or where
              we have a legal obligation.
            </p>

            <p className="mt-3">
              Where a user connects a third-party service, the user can withdraw
              that authorisation by disconnecting the service or revoking access
              through the provider.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Multi-tenant organisations</h2>

            <p className="mt-3">
              Root Health Ops is a multi-tenant service. Customer organisations
              have separate workspaces and provider connections.
            </p>

            <p className="mt-3">
              One organisation does not use another organisation&apos;s
              connected accounts, credentials or provider usage allowance.
              Access to organisational data is restricted according to workspace
              membership and authorised roles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. AI-assisted features</h2>

            <p className="mt-3">
              Some Root Health Ops features use artificial intelligence to help
              draft, summarise, organise or improve content and workflows.
              Information may be sent to contracted AI service providers when
              necessary to provide those features.
            </p>

            <p className="mt-3">
              Users remain responsible for reviewing generated content before
              using or publishing it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Sharing of information</h2>

            <p className="mt-3">
              We do not sell personal information.
            </p>

            <p className="mt-3">
              Information may be shared with service providers only where
              reasonably necessary to operate Root Health Ops. This can include
              hosting, database, authentication, payment, AI, email and
              connected-platform providers.
            </p>

            <p className="mt-3">
              We may also disclose information where required by law, court
              order, regulatory requirement, or where necessary to protect
              users, Root Health Ops or others from fraud, abuse or security
              threats.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Access tokens and credentials</h2>

            <p className="mt-3">
              Access tokens and connection credentials are used only for the
              authorised provider connection and associated Root Health Ops
              functionality.
            </p>

            <p className="mt-3">
              We apply technical and organisational safeguards intended to
              restrict unauthorised access to authentication credentials and
              customer data.
            </p>

            <p className="mt-3">
              Users should never provide Root Health Ops with their personal
              social-network password unless the relevant provider&apos;s own
              secure authentication page requests it. Root Health Ops uses
              provider-authorised authentication flows wherever supported.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Data retention</h2>

            <p className="mt-3">
              We retain information for as long as reasonably necessary to
              provide the service, maintain account and security records,
              satisfy legal or contractual obligations and resolve disputes.
            </p>

            <p className="mt-3">
              Connected-provider credentials may be deleted, revoked or made
              unusable when a provider is disconnected, an account is deleted,
              access expires, or deletion is otherwise required.
            </p>

            <p className="mt-3">
              Some limited records may be retained where necessary for security,
              fraud prevention, financial records or legal compliance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">11. Data deletion</h2>

            <p className="mt-3">
              Users may request deletion of their Root Health Ops personal data
              or account information by contacting:
            </p>

            <p className="mt-3 font-semibold text-emerald-300">
              enquiries@roothealth.app
            </p>

            <p className="mt-3">
              Where appropriate, we will delete or anonymise information unless
              retention is required for legal, security, contractual or
              financial-record purposes.
            </p>

            <p className="mt-3">
              Disconnecting a third-party service stops Root Health Ops from
              using that connection for future provider actions. Users may also
              revoke access directly through the relevant provider.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">12. International processing</h2>

            <p className="mt-3">
              Some service providers and connected platforms may process
              information outside the United Kingdom or the country in which the
              user is located.
            </p>

            <p className="mt-3">
              Where required, we use appropriate contractual, legal or provider
              safeguards for international transfers of personal information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">13. Security</h2>

            <p className="mt-3">
              We use reasonable technical and organisational measures designed
              to protect personal information against unauthorised access,
              alteration, disclosure or loss.
            </p>

            <p className="mt-3">
              No online service can guarantee absolute security. Users should
              protect their own credentials and notify us promptly if they
              suspect unauthorised access.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">14. Your data-protection rights</h2>

            <p className="mt-3">
              Depending on your location, you may have rights to access,
              correct, delete or restrict the processing of your personal
              information, object to certain processing, request portability, or
              withdraw consent.
            </p>

            <p className="mt-3">
              Requests can be sent to enquiries@roothealth.app. We may need to
              verify the identity of the requester before acting on a request.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">15. Children</h2>

            <p className="mt-3">
              Root Health Ops is intended for professional and organisational
              use and is not intended for children under 18.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">16. Changes to this policy</h2>

            <p className="mt-3">
              We may update this Privacy Policy as the service, law or connected
              platforms change. The current version and update date will remain
              available on this page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">17. Contact</h2>

            <p className="mt-3">
              Questions about privacy, personal information or deletion requests
              can be sent to:
            </p>

            <p className="mt-3 font-semibold text-emerald-300">
              enquiries@roothealth.app
            </p>
          </section>

          <div className="border-t border-slate-700 pt-6">
            <div className="flex flex-wrap gap-4">
              <Link href="/" className="text-emerald-300 hover:text-emerald-200">
                Home
              </Link>
              <Link
                href="/terms"
                className="text-emerald-300 hover:text-emerald-200"
              >
                Terms of Service
              </Link>
              <Link
                href="/signin"
                className="text-emerald-300 hover:text-emerald-200"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
