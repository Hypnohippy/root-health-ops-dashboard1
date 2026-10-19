# Fresh Preview migration cutover

Snapshot: main 702f2b7ab1ac2a41ca6e8c320fdcc138417e7077, before PR84 7ec8c3e5c5998386eee17eca345163964dcfb4dc.

1. Standard Supabase-managed platform schemas/roles (local proof uses versioned catalog-derived local-platform.sql).
2. 00000000000000_root_ops_schema_baseline.sql, explicitly opted in, empty public application schema only.
3. Zero retained legacy subsequent migrations at this snapshot.
4. PR84 migration is a pending compatibility fixture, not active infrastructure/Production migration.
5. Future approved migrations append after the snapshot and must be tested from empty.

Original supabase/migrations files remain untouched for audit/existing installations and existing tests. They are NOT the new empty-install entry point. Never replay those 25 incremental files over this current-state baseline. No history rows are edited or marked applied by this tooling.

| Existing file | Treatment | Reason |
| --- | --- | --- |
| 20260923090000_organisation_profiles.sql | Superseded for fresh Preview | Organisation profiles and merge RPC captured in final form; base organisations/members now included. |
| 20260923120000_growth_tenant_ownership.sql | Superseded for fresh Preview | Final ownership columns, constraints and policies captured. Historical row attribution is not replayed. |
| 20260923140000_acquisition_ingestion.sql | Superseded for fresh Preview | Acquisition tables, keys, indexes and policies captured. |
| 20260924100000_actionable_acquisition_queue.sql | Superseded for fresh Preview | Final acquisition status constraints/action functions captured; later replacements win. |
| 20260924130000_email_response_intake.sql | Superseded for fresh Preview | Final inbox/email fields, constraints, indexes, tables and policies captured. |
| 20260924170000_human_approved_email_sending.sql | Superseded for fresh Preview | Final send-request schema, RPCs, grants and triggers captured. |
| 20260924190000_consolidated_linkedin_growth.sql | Superseded for fresh Preview | Final LinkedIn target columns/identity constraints captured; no data consolidation replay. |
| 20260924193000_linkedin_acceptance_identity.sql | Superseded for fresh Preview | Final inbox acceptance/identity columns captured; no historical acceptance update replay. |
| 20260924210000_lifecycle_reconciliation.sql | Superseded for fresh Preview | Final revision/repair tables, functions and triggers captured. Legacy lifecycle SQL views are absent in Production and are not resurrected. |
| 20260925100000_acquisition_engine_state.sql | Superseded for fresh Preview | Final engine-state columns and trigger/function definitions captured. |
| 20260926100000_manual_completion_recovery.sql | Superseded for fresh Preview | Final manual-completion columns, guards and RPCs captured. |
| 20260927100000_acquisition_handoff.sql | Superseded for fresh Preview | Final acquisition action replacement captured; historical function definition superseded. |
| 20260927110000_canonical_target_import.sql | Superseded for fresh Preview | Final email column and canonical import RPC captured. |
| 20261001120000_email_conversation_timeline.sql | Superseded for fresh Preview | Final conversation-message schema, keys and policies captured. |
| 20261001193000_email_send_requests_multiple_replies.sql | Superseded for fresh Preview | Final reply/request unique keys and indexes captured; old unique constraint not restored. |
| 20261007100000_acquisition_target_promotion.sql | Superseded for fresh Preview | Final promotion function/grants captured. |
| 20261009100000_linkedin_absolute_cadence.sql | Superseded for fresh Preview | Final cadence columns/functions captured. No historical cadence backfill on empty data. |
| 20261009120000_linkedin_external_send_evidence.sql | Superseded for fresh Preview | Final external-send evidence RPC captured without recording evidence. |
| 20261009140000_linkedin_conversation_log.sql | Superseded for fresh Preview | Final LinkedIn conversation schema/functions/guards captured. |
| 20261009160000_linkedin_conversation_snapshots.sql | Superseded for fresh Preview | Final snapshot/direction constraints and RPC captured, not earlier constraint version. |
| 20261009170000_personal_signal_acquisition_actions.sql | Superseded for fresh Preview | Final action RPC captured. Production ledger records this SQL under 20261010054821; no ledger rewrite. |
| 20261013170000_founder_memory.sql | Superseded for fresh Preview | Final Founder tables/functions/constraints/policies captured, no research rows. |
| 20261014063937_relationship_workspaces.sql | Superseded for fresh Preview | Final relationship workspace schema/guards/policies captured, no workspaces seeded. |
| 20261016154246_relationship_identity_decisions.sql | Superseded for fresh Preview | Final identity decision schema/identity sequence/guards captured, no decisions seeded. |
| 20261018203554_social_response_cleanup.sql | Superseded for fresh Preview | Final social dismissal RPC captured, no cleanup action executed. |

Every file checksum is in migration-map.json. Text hashes use LF normalization to match Git across Windows/Linux. The ledger timestamp mismatch is retained explicitly in that map. No blanket idempotency corrections or historical DDL edits are made: non-idempotent CREATEs belong to the superseded chain, and the snapshot intentionally rejects replay.
