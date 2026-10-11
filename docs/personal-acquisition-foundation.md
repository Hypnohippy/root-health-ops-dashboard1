# Personal Acquisition foundation — PR #55

## Classification and authority

Personal prospects require a recorded, identified first-party interaction, verified
source evidence, tenant ownership and a separately evidenced legitimate next step.
`metadata.first_party_interaction` is an explicit evidence contract, not a discovery
classifier output. Discovery imports cannot assert this contract. Its tenant must
match the item's organisation; an owned-asset interaction must also identify the
asset, owning tenant and verification evidence. Public reply permission never
grants private-contact permission. Anonymous Capacity Check aggregates are not
contact identities. No new first-party connector is introduced in this PR.

Public discussions and search evidence are Audience Intelligence: content and
market research, with no outreach/pipeline promotion or person milestones.
Existing exact-text and safety requirements still apply. Research without usable
evidence remains in Needs source review; synthetic text does not become a lead.

Partners & distribution retain business-contact safety checks. Initial outreach
also requires a usable source and a verified business route. Existing contact
records, external-send receipts, engine evidence and CRM states determine whether
the card offers initial outreach or conversation continuation. No cadence,
growth-target, partner auto-dispatch or Commercial policy is replaced.

## Sources and history

Source checks use only the tenant's stored Personal source URL. They enforce HTTPS,
public DNS addresses, address-pinned TLS, bounded DNS/request time and body size,
and manually checked redirects. Private/reserved networks and grounding redirects
are rejected. Unrelated sites/homepages cannot replace the original source.
HTTP accessibility and exact evidence verification are separate observations.
Checks are cached briefly by tenant, URL and evidence in server memory; they do
not write Production data. A failure blocks source-dependent actions server-side
and is visible as “Source unavailable — research again”. Save/Dismiss do not
require a live website. Existing evidence, action receipts and Publishing drafts
are not deleted or rewritten by this projection.

Reddit is historical-only. Personal ingestion, export, qualification, grouping,
counts and action guards reject new/active Reddit use. The existing Google project
must receive `personal-social-discovery-scope.patch` and the updated exporter before
its live discovery/writer stops considering Reddit. This patch modifies existing
functions only; no second engine or triggers. It is intentionally **not applied**
under the no-Production-writes instruction. No discovery run is needed to apply
these exclusions. Historical rows must remain untouched.

Grouping still happens before pagination, by tenant, source and exact evidence.
An actioned member owns its group; conflicting action evidence blocks another
action. Only boolean `metadata.test === true` hides an explicit test record.

## Publishing contracts

Social content uses the existing idempotent, pending-approval Publishing record
and tenant-scoped saved draft. Supported text handoffs remain LinkedIn, Facebook
and Threads. An article/search asset is an editable editorial brief requiring
manual website publication. Video requires the existing composer and real media;
text is not represented as a completed video. No external publication occurs.

## Channel truthfulness (Root audit, 11 October 2026)

Account connection, publish permission, engagement reading, response permission
and private-contact permission are independent. These observations are Root-specific
and must not become defaults for another tenant.

| Channel | Observed capability / outstanding verification |
| --- | --- |
| Facebook | Connected Fuel Geist asset; publishing permission unverified; comment access needs permissions; Root ownership not established |
| Instagram | Connected Fuel Geist asset; publishing permission unverified; comment permissions not established; Root ownership not established |
| Threads | Connected; publishing permission unverified; response reading/replying not implemented |
| LinkedIn | Connected; publishing permission unverified; response reading access-gated; messages manual |
| TikTok | Reconnection required; preserve inbox/manual-completion workflow |
| Google/Search | Research/demand capability exists; continuous acquisition feed not proven |
| X/Twitter | Planned; no operational OAuth/publishing/reply integration |
| Pinterest | Planned; no operational search/ingestion/publishing path |

## Future tenant intelligence boundary

Founder Intelligence remains named Founder, private, founder-only and unchanged.
Its APIs, identity, stored research and hard-coded strategy are not customer inputs.
Future shared research should take an explicit authorised tenant context: canonical
Growth Profile plus reviewed website scan and onboarding/questionnaire context.
Research, source verification, contact evidence and editable draft generation
should accept this context through separate shared services; customer callers must
not call Founder routes or reuse the Founder context module. Current Personal
draft routes already use `withTenantRoute` and tenant generation profiles. No full
customer intelligence experience, new lifecycle, schema or discovery widening is
implemented here.
