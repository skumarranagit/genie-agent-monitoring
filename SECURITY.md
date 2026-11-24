# Security & access control recommendations

> **Recommendations only — not implemented in this blueprint.** The trace tables ship with plain Unity Catalog grants.
> Apply and test the controls below in your own workspace before granting anyone else access. See also
> [DISCLAIMER.md](DISCLAIMER.md).

## Why this matters

The trace tables (`message_trace`, `genie_api_raw`) contain users' **prompts, answers, identities (email, IP, user agent)
and copies of query results** (Agent-mode tool outputs and raw API payloads). Those copies **do not inherit the source
tables' row filters or column masks**, so a reader of the trace tables could see data they cannot query directly.
**Do not open these tables for general-purpose access.**

## Recommendations

### 1. Lock it down with grants first
- Keep the tables in a dedicated, restricted catalog/schema.
- Grant access only to: a **reviewers group**, the **ingest job service principal**, and the **app service principal**.
  No `account users` (or other broad groups).
- Make a **group or service principal** the table owner — not an individual user.

### 2. Tag sensitive columns (governed tags)

| Tag value | Columns |
|---|---|
| `prompt` | `prompt_text`, `feedback_comment`, `feedback_notes` |
| `model_output` | `answer_text`, `thoughts`, `agent_steps` *(contains result rows)* |
| `identity` | `user_email`, `source_ip`, `user_agent` |
| `raw` | `raw_json`, bronze `payload` |

### 3. Two ABAC policies on the schema
- **Column mask** — redact all tagged columns for everyone **except** reviewers and the ingest job.
- **Row filter** — agent owners see only **their own agents' rows** (via a small `space_id` → owner-group mapping
  table); everyone can see **their own questions**.

### 4. Simplify the data model
Split into two tables:
- **`message_metrics`** — IDs, timestamps, ratings, SQL stats, lineage (low risk, broadly shareable).
- **`message_content`** — prompts, answers, steps, notes (reviewers only).

Most users only ever need metrics, and masking stays simple (complex `ARRAY<STRUCT<…>>` columns would otherwise each
need a type-specific mask function).

### 5. Make the app respect it
Switch the app to **on-behalf-of-user** authorization (`user_api_scopes: [sql]` in `genie-monitor/databricks.yml`) so
each viewer sees only what ABAC allows. At minimum, restrict app **CAN USE** to the reviewers group — the reference app
reads as its service principal, so every app user sees whatever that principal can read.

### 6. Watch-outs *(per Databricks ABAC documentation, reviewed November 2026)*
- Put the **ingest job identity in every policy's `EXCEPT`** list.
- Only **one row filter per table and one mask per column** can apply to a user — overlapping policies, or manual
  row filters / column masks on the same table, **block access** with an error.
- Readers need **serverless compute or Databricks Runtime 16.4+**; older runtimes cannot read ABAC-secured tables.
- **Clones and Delta Sharing** fail unless the principal is in `EXCEPT` (useful: it prevents copying the data out).
- Set a **retention policy** and a **purge process** for conversations deleted in Genie (bronze keeps raw copies).

### 7. Test before production
Query as a **non-exempt user** to confirm masks and filters apply, and confirm the ingest job and app still work.

**Verify in your workspace** (not covered in the documentation reviewed): whether SQL warehouses count as supported
compute, whether table owners or admins bypass policies, and how masks behave on writes and time travel.

## References
- [Unity Catalog ABAC](https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/)
- [ABAC requirements, quotas and limitations](https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/requirements)
- [Policy evaluation](https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/policy-evaluation)
- [`CREATE POLICY`](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-ddl-create-policy)
- [Governed tags](https://docs.databricks.com/aws/en/database-objects/tags)
