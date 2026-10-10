Public discussion action routing
===============================

This extends the existing Personal Lead Engine, Social Queue, state exporter and Acquisition UI. It adds no table, page, trigger or workflow. No migration is required for these metadata fields.

Reddit is always CONTENT_SIGNAL. LinkedIn may use PUBLIC_RESPONSE after the existing direct URL, exact source text and explicit safety gates pass. Facebook, Instagram, Threads, X and TikTok default to CONTENT_SIGNAL; PUBLIC_RESPONSE additionally requires explicit verification and evidence of an owned/appropriate Root or David public engagement surface. Public availability does not grant permission to reply.

CONTENT_SIGNAL carries the exact original public text, source URL/platform, theme, Root relevance, content angle, asset type and optional non-personal CTA. It carries no prepared individual reply. Urgent self-harm/immediate-danger material is excluded from acquisition. Existing private-outreach, health-profiling and identity-harvesting prohibitions remain.

The existing writer stores the action in Mode and source platform in Platform. It uses the existing Notes column for URI-encoded `Social action:` evidence, preserving content suggestions and explicit surface evidence. The exporter preserves Social ID exactly, stores explicit `metadata.action_type`, and uses the existing personal_opportunity type for Content Signals. All four safety flags and exact Original Post remain mandatory. Content rows additionally require a content angle and asset type; public-response rows still require Prepared Reply. Legacy evidence is neither fabricated nor retrofitted.

Acquisition labels Content Signals and offers existing content/review destinations. It hides personal response/engagement controls; the action API also rejects those actions. Existing Personal Signal confirmations remain available for qualified PUBLIC_RESPONSE records.

`personal-social-actions.patch` records the focused changes to the existing live Code.gs. `personal-social-action-functions.gs` is a testable reference containing replacement bodies for existing functions, not a second engine. Do not add it as another Apps Script file with duplicate function names. Shared routing helpers are in the existing OpsEngineStateExport.gs. The live project remains 1pi0mG_C8VvcriiEKHwi6erV6NeEhriVFCJe_cNDBP2H8dZEHHLYnJoLX. No export, outbound action or discovery pass is needed to validate routing; automated tests use isolated fixtures only.
