# Root visual system — Growth pilot

PR #69 introduces a reusable visual language, initially activated only on the representative Relationship detail route. The Relationships list, other Growth pages, Acquisition, Responses, Founder, Publishing and other primary areas retain their current presentation. Navigation labels, order, destinations, access checks, attention counts and mobile menu behaviour remain authoritative and unchanged.

## Foundation

`app/dashboard/root-visual-system.css` owns the `--ops-*` tokens: navy frame/on-frame text, pale canvas, white/glass surfaces, ink/muted text, borders, shadows, emerald action colours and blue/violet/green intelligence pairs. The frame uses light text; content surfaces use dark ink. Text token pairs are checked against WCAG AA normal-text contrast (4.5:1). Do not place pale text intended for the navy frame on white surfaces.

`OpsSurface` and `OpsIntelligenceCard` in `app/dashboard/components/visual/OpsSurface.tsx` are presentation primitives. They do not fetch, infer state, check permissions, write records or generate advice. Tone conveys the section's function, not invented confidence, health or relationship scores. Blue describes current context; violet describes history/strategy; green highlights the next recorded move.

## Pilot boundaries

- Representative Relationship detail shell: navy desktop sidebar, preserved existing subnavigation, pale header and a search entry linking to the existing Relationships search. No global search backend or fictitious search field.
- Representative Overview: a new summary/metrics header, intelligence strip, split briefing/journey card, assistant rail and lower activity/objective/value row. Pale working surfaces, evidence-only journey, three intelligence cards, expandable commercial calculation, exact conversation evidence, saved notes/tasks and a persistent action dock using the existing handlers.
- Relationship assistant: visibly forthcoming. Suggested prompts are disabled. Open Strategy Room selects the existing Phase 1 shell. No generated claims, message or AI chat endpoint.
- Commercial numbers and calculation basis are unchanged. Unknown remains Not established. No illustrative values, scores, charts, fabricated milestones or health metrics from the reference image are treated as data.
- Mobile: existing navigation disclosure, stacked content, horizontally scrollable tabs and a compact dock. No new resize listeners, polling or API requests.

## Expansion rule

Use the shared tokens and presentation primitives for a separately reviewed page rollout. Do not enable the theme for additional primary areas until approved. Keep lifecycle, permission filtering, source evidence and actions outside presentation primitives. Existing red reply-attention badges must retain their meaning and tenant-scoped deep links.

## Representative Overview evidence rules

The second visual pass retains a Health/Momentum card with an explicit unassessed state; no score or health rubric is invented. Pipeline chevrons select only a directly supported current lifecycle stage and never fill earlier stages automatically. Other states retain their exact lifecycle label with an unestablished pipeline position.

Key Metrics counts unique stored conversation entries, explicitly marked snapshots and open tasks from the existing server-filtered payload. Snapshot contents are not parsed into individual messages. The activity graphic uses only valid actual event timestamps, grouped by UTC date, deduplicated by event ID; it appears only with at least two dated days. It shows recorded event counts, not performance, sentiment or revenue growth. Unknown trends remain a visible empty component.

Saved commercial values may show a proportional Potential/Expected scope comparison, explicitly labelled as comparison rather than growth. No saved values means a visible Not established comparison state. Calculation inputs, stored values and service logic are not changed.
