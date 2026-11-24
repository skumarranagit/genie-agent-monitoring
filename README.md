# Genie Agent monitoring

> [!WARNING]
> **Blueprint only — not for production as-is.** This is a reference implementation for learning and evaluation. It is
> not an official Databricks product, is not covered by Databricks Support, and is provided "AS IS" without warranty.
> It stores users' prompts and answers (potentially PII/PHI). Complete your own security, privacy, cost and dependency
> review before any production use. See **[DISCLAIMER.md](DISCLAIMER.md)**.

End-to-end trace for Genie Agents (formerly Genie spaces): **prompt → reasoning → SQL → execution → lineage → answer → feedback → audit**, in one Delta table, plus a Databricks App to browse it (like the Genie *Monitor* tab, across agents).

```
Genie Conversation API ──┐  messages · agent /items · list-comments
                         ├─► 01_genie_trace_ingest (serverless job, every 30 min)
system.query.history ────┤      │ bronze: genie_api_raw   (append-only raw JSON, survives conversation deletion)
system.access.table_lineage ┤   └ silver: message_trace   (1 row / message, MERGE on message_id)
system.access.audit ─────┘                    │
                                              ▼
                                  genie-monitor (AppKit app, reads as app SP)
```

## Contents

| Path | What |
|---|---|
| `01_genie_trace_ingest.py` | Databricks notebook (source format). Params: `space_id`, `conversation_id` (blank = all), `lookback_days` (0 = all), `target_schema`. |
| `jobs/genie_trace_ingest.job.json` | Serverless job, every 30 min, `lookback_days=2`, max 1 concurrent run. |
| `genie-monitor/` | AppKit (React + TypeScript) app. SQL in `config/queries/`; pages: `client/src/pages/monitor/` (Monitor) and `client/src/pages/architecture/` (ingestion architecture + live pipeline stats). |
| `scripts/grant_app_sp.sh` | USE CATALOG + USE SCHEMA + SELECT on the trace schema for the app's service principal. |
| `scripts/deploy_all.sh` | Notebook → job → app → grants, end to end. |

## Deploy

**Prerequisites:** Unity Catalog workspace with system tables enabled (`access`, `query`); Databricks CLI ≥ 1.0 with a profile; Node ≥ 22.23 (see `genie-monitor/.nvmrc`; for the app build).
The identity that runs the job needs **CAN MANAGE** on the Genie Agent (to list every user's conversations) and SELECT on
`system.query.history`, `system.access.table_lineage`, `system.access.audit`.

```bash
# 0. (optional) use a schema other than main.genie_monitoring
./scripts/set_schema.sh my_catalog.genie_monitoring

# 1. deploy notebook -> scheduled job -> app -> app service-principal grants
PROFILE=<cli-profile> SPACE_ID=<genie-space-id> WAREHOUSE_ID=<sql-warehouse-id> ./scripts/deploy_all.sh

# 2. one-off backfill of every conversation in the space
databricks jobs run-now <job_id> --json '{"job_parameters":{"lookback_days":"0"}}' --profile <cli-profile>
```

`SPACE_ID` is in the Genie Agent URL: `…/genie/rooms/<SPACE_ID>`. The first app deploy can fail with
`INSUFFICIENT_PERMISSIONS` until the grants step runs; the script redeploys afterwards.

Overview for stakeholders: open [`docs/index.html`](docs/index.html) in a browser.

## `message_trace` columns

`space_id, space_title, conversation_id, conversation_type (CHAT|AGENT), message_id, user_id, user_email, created_ts, status, error, prompt_text, answer_text, thoughts[], queries[] (sql, statement_id, row_count), agent_steps[] (reasoning / tool_call / tool_output), feedback_rating, feedback_comment, feedback_ts, feedback_notes[], exec[] (executed_by, duration_ms, read_rows, warehouse_id…), lineage_sources[] (TABLE / METRIC_VIEW), audit_create_ts, audit_create_action, source_ip, user_agent, raw_json, ingested_at`

## Things learned (verified in a workspace, Nov 2026)

- **Agent-mode** answers and tool calls are only in `GET /api/2.0/genie/agents/{space_id}/conversations/{cid}/items`; the messages endpoint returns SQL + viz but not the narrative answer.
- **Feedback notes** live in `…/conversations/{cid}/list-comments`; `message.feedback.comment` only sometimes mirrors them. Thumbs-up can create an empty comment.
- **Join key** is `attachments[].query.statement_id` → `system.query.history.statement_id` → `system.access.table_lineage.statement_id`. `executed_by` is the end user.
- **Audit** (`service_name='aibiGenie'`) has IDs only, never prompt text. Questions **routed from Genie One** have no `aibiGenie` create event (only `genieChat.createGenieChatResponse`), so `user_email` falls back to a SCIM lookup of `user_id`.
- System tables lag ~10–60 min; MERGE keeps earlier enrichment, so later runs fill gaps.
- The app reads as its service principal: anyone with CAN USE on the app sees **all users' prompts**. Gate with app permissions, or switch to OBO + a row filter.
