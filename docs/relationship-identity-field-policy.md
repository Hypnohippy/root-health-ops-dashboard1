# Shadow identity field and Finder policy

Applies only after tenant/Founder filtering and structural membership resolution. A human same-relationship decision authorises association, not the accuracy of every field. No source row is rewritten; no existing consumer uses this policy yet.

| Field | Selection rule | Conflict / missing rule |
|---|---|---|
| Canonical display name | Person: consensus of stored author_name, target_name, person, person_name. Company: company consensus, never an associated sender/person name. Only if person names are absent may an exact verified nested Founder contact supply attribution. | NFKC/case/whitespace-equivalent values count as one; preserve stored spelling deterministically. Different substantive names remain disputed alternatives; canonical value is Not established. No name expansion, slug inference or AI choice. |
| Company | Consensus of explicit company facts from confirmed members. | Multiple employers/brands remain alternatives; do not infer current employer or company identity from domain. Person and company entities stay distinct. |
| Role/title | Consensus of explicit role_title facts. | No inferred role from message text or category. Conflicting titles have no winner; timestamps alone do not establish current employment. |
| Primary email | Exactly one structurally verified email alias. | Multiple verified addresses remain valid channel aliases with no primary. An unverified/manual-send route is evidence of use, not a verified identity. Do not select by recency, source order or domain. |
| LinkedIn | Exactly one canonical verified profile identity. | Conflicting profiles block same-relationship resolution; no source wins. Do not choose newest profile or use names to resolve it. |
| Provenance | Union of permission-filtered source refs, original evidence IDs, field rule and decision authority. | Preserve disagreements and original channel/thread scope. Human association never upgrades notification-only evidence into actual message text. |
| Channel aliases | Retain original email/profile value, verification basis and evidence IDs. Gmail IDs remain scoped to their exact threads/messages; handles without platform identity are not global aliases. | keep_separate is a hard constraint; shared quarantined aliases cannot auto-join. Do not export protected aliases through ordinary search. |

## Which source wins?

No blanket ranking of Acquisition, Inbox, Growth or Founder. Direct stored fields agree or remain disputed. A company-typed name outranks person-shaped fields **for that company display only**. A direct person name outranks the fallback nested-contact attribution. This is field/type precedence, not table precedence or join authority. A future explicit human field-selection action would require its own reviewed field decision contract; the present same-relationship checkbox does not provide one.

## Finder/search after reconciliation

Build a disposable, tenant/permission-filtered index from confirmed canonical group membership: canonical name/company/role, all recorded conflicting label alternatives (marked disputed), verified email aliases, canonical LinkedIn aliases, source refs and decision evidence. Search labels retrieve candidates; they never establish identity or merge groups. Unknown fields stay absent. keep_separate partitions and quarantined aliases survive indexing. Multiple canonical matches require user choice. Founder evidence must be removed before indexing for an unauthorised user. No unverified email, inferred company/domain identity, unrelated thread, message body or hidden provenance is promoted into an identity key.

Code-owned destinations are constructed from resolved source/workspace locators; no arbitrary URL or automatic workspace creation. These are future Finder contracts only; live search remains unchanged.

## Search replay coverage

The 11 previously omitted query probes use 13 new tokens. The supplemental read-only Production token check returns only source IDs/token hits, never bodies, and runs in BEGIN READ ONLY / ROLLBACK. It observes current search extras at a later time than the historical metadata snapshot. The combined counterfactual is therefore explicitly a **hybrid historical membership + later supplemental search observation**, not a new atomic Production snapshot. Existing baseline terms retain their original capture. This cannot prove absence of intervening source edits; preserve that limitation when interpreting discovery counts.

## Rerun outcome

All 11 probes are assessed: current projection finds 0/11, hypothetical reconciled shadow finds 11/11. Zero probes remain excluded. Full three-scenario replay covers 2,411 current relationships / 34,888 field comparisons per scenario. All-same retains 13 identity splits / 13 withheld pairs, with zero unsupported joins, overlapping memberships or separation violations. Discoverable source records rise from 1,231 to 1,302 (+71); canonical discoverable groups from 1,175 to 1,194 (+19). Defer/separate preserve original identity grouping.

All-same disagreement categories: current-correct/shadow-wrong 65; shadow-correct/current-wrong 1,201; insufficient 431; historical gaps 200; identity ambiguity 13. Agreement is 32,978/34,888 (94.5253%). These categories are not silently reclassified to improve the score.

**NEEDS MORE IDENTITY POLICY WORK** remains the recommendation. The one additional displayed-name disagreement remains: the Nutritionist Resource group is person-shaped, has a company but no person name, and legacy presentation uses the company as the contact name. The explicit policy refuses to manufacture a person name. Company-typed display is covered by tests, but changing this group's entity type or introducing a company-as-person fallback would require a separate explicit policy decision. No live source repair is performed.

All 52 groups still require real evidence review. Counterfactual all-same is not confirmation of their identities. Exact body-free outcomes, per-probe results and both observation times are in `relationship-identity-field-policy-results.json`. Checks: 195/195 shadow/identity/parity/Day 0 contracts, TypeScript and targeted lint pass. No consumer, UI, schema, lifecycle or operational data changes.
