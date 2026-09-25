# Phase 4A: Google Growth Engine receiver

For mutable engine operational snapshots, see [Google engine state sync](google-engine-state-sync.md).
The opportunity intake contract on this page remains unchanged.

The existing B2B and Personal Lead Engines can submit opportunities to Ops. No Apps Script changes, Sheets write-back, model calls, message sending, scheduling or publishing are included.

## Deployment

1. Apply `supabase/migrations/20260923140000_acquisition_ingestion.sql` in Supabase. The existing organisation must already exist; the migration does not create or select a default organisation.
2. Set server-only Vercel environment variable `GROWTH_INGESTION_KEYS` to a JSON array of credentials. Generate a dedicated random secret (at least 32 characters) per organisation/integration. Do not use CRON_SECRET, Supabase keys or a browser-visible NEXT_PUBLIC variable.

```json
[
  {
    "organisation_id": "78fa2ac8-e7b6-4b9b-9604-035723ece6b1",
    "secret": "REPLACE_WITH_A_RANDOM_SERVER_SECRET_AT_LEAST_32_CHARACTERS",
    "source_engines": ["root_health_b2b", "root_health_personal"]
  }
]
```

Root Health's ID is configuration and must also be explicitly included in every request. It is not a code fallback. Add separate credentials for other organisations. A credential authorizes only its configured organisation and engines, even if a caller supplies another valid organisation ID. Keep secrets unique; rotate by deploying the replacement configuration and updating the future sender. This phase does not configure any sender.

## API contract

`POST /api/growth/ingest`

Headers: `Authorization: Bearer <dedicated-secret>` and `Content-Type: application/json`.

```json
{
  "organisation_id": "78fa2ac8-e7b6-4b9b-9604-035723ece6b1",
  "records": [
    {
      "source_engine": "root_health_b2b",
      "source_record_id": "stable-source-record-123",
      "record_type": "b2b_lead",
      "source_url": "https://example.com/source",
      "evidence": "Relevant source excerpt",
      "entity": "Example organisation",
      "person": "Named contact from the source",
      "company": "Example company",
      "reason": "Why the engine selected this opportunity",
      "signal": "The observed event or request",
      "suggested_action": "Review the evidence and decide whether to contact",
      "status": "new",
      "metadata": {"sheet_tab": "B2B", "source_status": "qualified"}
    }
  ]
}
```

Required record fields: source_engine, source_record_id, record_type. Supported types: b2b_lead, personal_opportunity, partner_opportunity, social_opportunity. Optional string fields above may be omitted/null. Status defaults to new and accepts new/reviewing/accepted/dismissed; preserve other upstream statuses in metadata.source_status. Metadata must be an object. URLs must be HTTP(S) without embedded credentials; Ops never fetches them.

Maximum 100 records and 256 KiB per request. String/metadata limits are enforced before database access. A record-level organisation_id is rejected. Responses: 200 with `{success:true, received, inserted, duplicates}`; invalid input 400, unsupported content type 415, oversized body 413, invalid credentials/scope 403, missing server configuration or database failure 503. No error response exposes database internals or secrets.

The unique key is `(organisation_id, source_engine, source_record_id)`. Retries and duplicates are ignored atomically by PostgreSQL; first import wins and is not overwritten. Source IDs must remain stable across runs; do not use mutable row numbers. IDs can be reused in a different tenant or engine without collision. To change imported content/status later requires a separate reviewed workflow, not retry ingestion. One batch is a single database statement, and invalid input is rejected before any writes. FK failures reject unknown organisations.

## Queue

Open `/dashboard/growth/acquisition?organisationId=78fa2ac8-e7b6-4b9b-9604-035723ece6b1` or use **Open acquisition queue** in the Growth Cockpit (preserves the selected organisation query parameter). Without a selection the page asks for an explicit organisation ID. This is a read-only review queue with status filtering and 25-item pagination, evidence, source links, source IDs and metadata. No send/publish buttons or status mutations are added.

`GET /api/growth/acquisition?organisationId=<uuid>&status=new&page=0` uses the existing signed-in membership helper with read access. A service ingestion credential does not authorize queue reads. An authenticated browser session does not authorize ingestion. No latest/default organisation lookup exists. Foreign tenants are denied before queue reads. RLS is enabled and direct anon/authenticated table access revoked; only server routes using service_role can access the table.

## Schema

New `public.acquisition_items`: UUID id, required organisation FK and source identity, checked record_type/status, source_url/evidence/entity/person/company/reason/signal/suggested_action, JSONB metadata, created_at. Unique index enforces dedupe; queue index supports tenant/date ordering. Existing tables and publishing remain unchanged. Migration has not been applied live.

## Validation and limits

Regression tests exercise the actual ingestion and listing handlers with mocked auth/database adapters, plus execute the migration and dedupe SQL in PGlite. Coverage includes credential-to-tenant/source binding, missing org/config/secret, payload validation, all record types, retry preservation, cross-tenant dedupe, direct database read denial, and authenticated queue tenant isolation. Provider engines and production Supabase are not contacted. The queue is intended for reviewed intake, not an automated action pipeline. Existing lead engines need a later explicit integration task to send this contract.
