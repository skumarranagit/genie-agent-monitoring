# Databricks notebook source
# MAGIC %md
# MAGIC # Genie Agent trace ingest
# MAGIC Builds an end-to-end trace per Genie message: **prompt → answer → reasoning → SQL → execution → lineage → feedback → audit**.
# MAGIC
# MAGIC | Layer | Table | Source |
# MAGIC |---|---|---|
# MAGIC | Bronze | `genie_api_raw` | Genie Conversation API (messages + Agent-mode `/items`), append-only, survives conversation deletion |
# MAGIC | Silver | `message_trace` | One row per message, MERGE on `message_id`; enriched from `system.query.history`, `system.access.table_lineage`, `system.access.audit` |
# MAGIC
# MAGIC **Run-as needs:** CAN MANAGE on the Genie space (for `include_all=true`), SELECT on the system tables above.
# MAGIC System tables lag ~10–60 min, so re-running later fills in exec/lineage/audit columns (MERGE is idempotent).

# COMMAND ----------

dbutils.widgets.text("space_id", "", "Genie space ID (required)")
dbutils.widgets.text("conversation_id", "", "Conversation ID (blank = all in space)")
dbutils.widgets.text("lookback_days", "7", "Only conversations created in last N days (0 = no limit)")
dbutils.widgets.text("target_schema", "main.genie_monitoring", "Target catalog.schema")

SPACE_ID = dbutils.widgets.get("space_id").strip()
CONV_ID = dbutils.widgets.get("conversation_id").strip()
LOOKBACK_DAYS = int(dbutils.widgets.get("lookback_days") or 0)
TGT = dbutils.widgets.get("target_schema").strip()
if not SPACE_ID:
    raise ValueError("space_id is required: the Genie Agent (space) ID from its URL /genie/rooms/<space_id>")

# COMMAND ----------

import json, time, datetime as dt
from databricks.sdk import WorkspaceClient

w = WorkspaceClient()

def api_get(path, query=None):
    for attempt in range(4):  # Genie API does not retry for you
        try:
            return w.api_client.do("GET", path, query=query or {})
        except Exception as e:
            if attempt == 3 or "429" not in str(e) and "503" not in str(e):
                raise
            time.sleep(2 ** attempt)

space = api_get(f"/api/2.0/genie/spaces/{SPACE_ID}")
SPACE_TITLE = space.get("title")

# --- conversations ---------------------------------------------------------
if CONV_ID:
    convs = [{"conversation_id": CONV_ID, "agent_type": None}]
else:
    convs, tok = [], None
    cutoff_ms = (time.time() - LOOKBACK_DAYS * 86400) * 1000 if LOOKBACK_DAYS else 0
    while True:
        q = {"include_all": "true", "page_size": 100}
        if tok: q["page_token"] = tok
        r = api_get(f"/api/2.0/genie/spaces/{SPACE_ID}/conversations", q)
        page = r.get("conversations", [])
        convs += [c for c in page if c.get("created_timestamp", 0) >= cutoff_ms]
        tok = r.get("next_page_token")
        # list is newest-first: stop once a page is entirely older than cutoff
        if not tok or (page and page[-1].get("created_timestamp", 0) < cutoff_ms):
            break

print(f"{SPACE_TITLE}: {len(convs)} conversation(s)")

# COMMAND ----------

# --- pull messages (+ Agent-mode items) -----------------------------------
ingested_at = dt.datetime.now(dt.timezone.utc)
raw_rows, msgs_by_conv, items_by_conv, comments_by_msg = [], {}, {}, {}

for c in convs:
    cid = c["conversation_id"]
    m = api_get(f"/api/2.0/genie/spaces/{SPACE_ID}/conversations/{cid}/messages")
    msgs_by_conv[cid] = m.get("messages", [])
    raw_rows.append((SPACE_ID, cid, "messages", json.dumps(m), ingested_at))

    # Feedback notes / review requests are stored as message comments (source of truth;
    # message.feedback.comment only sometimes mirrors them)
    comments, tok = [], None
    while True:
        q = {"page_token": tok} if tok else {}
        r = api_get(f"/api/2.0/genie/spaces/{SPACE_ID}/conversations/{cid}/list-comments", q)
        comments += r.get("comments", []) or []
        tok = r.get("next_page_token")
        if not tok: break
    for cm in comments:
        comments_by_msg.setdefault(cm.get("message_id"), []).append(cm)
    if comments:
        raw_rows.append((SPACE_ID, cid, "comments", json.dumps({"comments": comments}), ingested_at))

    # Agent mode keeps the narrative answer + tool-call history in /items
    items, after = [], None
    try:
        while True:
            q = {"limit": 100}
            if after: q["after"] = after
            r = api_get(f"/api/2.0/genie/agents/{SPACE_ID}/conversations/{cid}/items", q)
            items += r.get("data", []) or []
            if not r.get("has_more"): break
            after = r.get("last_id")
    except Exception as e:  # Chat-mode conversations return nothing / error here
        items = []
    if items:
        items_by_conv[cid] = items
        raw_rows.append((SPACE_ID, cid, "items", json.dumps({"data": items}), ingested_at))

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {TGT}")
spark.sql(f"""
CREATE TABLE IF NOT EXISTS {TGT}.genie_api_raw (
  space_id STRING, conversation_id STRING, endpoint STRING, payload STRING, ingested_at TIMESTAMP)
COMMENT 'Append-only raw Genie Conversation API payloads (messages + agent items).'""")
spark.createDataFrame(raw_rows, "space_id STRING, conversation_id STRING, endpoint STRING, payload STRING, ingested_at TIMESTAMP") \
     .write.mode("append").saveAsTable(f"{TGT}.genie_api_raw")

# COMMAND ----------

# --- flatten to one row per message ---------------------------------------
def ts(ms):
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc) if ms else None

def split_items_by_message(items):
    """Assign each agent item to the user turn it follows (input ids end in '_input')."""
    out, current = {}, None
    for it in items:
        mid = (it.get("metadata") or {}).get("message_id")
        if it.get("type") == "message" and it.get("role") == "user":
            current = mid or it.get("id", "").removesuffix("_input")
        key = mid or current
        if key: out.setdefault(key, []).append(it)
    return out

def text_of(content):
    return "\n".join(x.get("text", "") for x in (content or []) if isinstance(x, dict) and x.get("text"))

rows = []
for cid, msgs in msgs_by_conv.items():
    agent_items = split_items_by_message(items_by_conv.get(cid, []))
    for m in msgs:
        mid = m.get("message_id") or m.get("id")
        atts = m.get("attachments") or []
        answer = "\n".join(a["text"].get("content", "") for a in atts if "text" in a) or None
        thoughts, queries = [], []
        for a in atts:
            if "query" in a:
                q = a["query"]
                queries.append({"attachment_id": a.get("attachment_id"), "title": q.get("title"),
                                "sql": q.get("query"), "statement_id": q.get("statement_id"),
                                "row_count": (q.get("query_result_metadata") or {}).get("row_count")})
                thoughts += [{"type": t.get("thought_type"), "content": t.get("content")} for t in (q.get("thoughts") or [])]
        steps = []
        for it in agent_items.get(mid, []):
            t = it.get("type")
            if t == "message" and it.get("role") == "user":
                continue
            if t == "message":
                steps.append({"type": "assistant_message", "name": None, "arguments": None, "output": text_of(it.get("content"))})
                answer = answer or text_of(it.get("content"))
            elif t == "reasoning":
                steps.append({"type": "reasoning", "name": None, "arguments": None, "output": text_of(it.get("content"))})
            elif t == "function_call":
                steps.append({"type": "tool_call", "name": it.get("name"), "arguments": it.get("arguments"), "output": None})
            elif t == "function_call_output":
                steps.append({"type": "tool_output", "name": it.get("call_id"), "arguments": None, "output": (it.get("output") or "")[:20000]})
        fb = m.get("feedback") or {}
        err = m.get("error")
        notes = sorted(
            [{"comment_id": cm.get("message_comment_id"), "user_id": str(cm.get("user_id")) if cm.get("user_id") else None,
              "comment_type": cm.get("comment_type"), "content": cm.get("content") or None,
              "created_ts": ts(cm.get("created_timestamp"))}
             for cm in comments_by_msg.get(mid, [])],
            key=lambda n: n["created_ts"] or ingested_at)
        latest_note = next((n["content"] for n in reversed(notes) if n["content"]), None)
        rows.append({
            "space_id": SPACE_ID, "space_title": SPACE_TITLE, "conversation_id": cid,
            "conversation_type": "AGENT" if cid in items_by_conv else "CHAT",
            "message_id": mid, "user_id": str(m.get("user_id")) if m.get("user_id") else None,
            "created_ts": ts(m.get("created_timestamp")), "last_updated_ts": ts(m.get("last_updated_timestamp")),
            "status": m.get("status"), "error": json.dumps(err) if err else None,
            "prompt_text": m.get("content"), "answer_text": answer,
            "thoughts": thoughts, "queries": queries, "agent_steps": steps,
            "feedback_rating": fb.get("rating") if fb.get("rating") not in (None, "NONE") else None,
            "feedback_comment": fb.get("comment") or latest_note,
            "feedback_notes": notes,
            "raw_json": json.dumps(m), "ingested_at": ingested_at,
        })

schema = """space_id STRING, space_title STRING, conversation_id STRING, conversation_type STRING, message_id STRING,
user_id STRING, created_ts TIMESTAMP, last_updated_ts TIMESTAMP, status STRING, error STRING,
prompt_text STRING, answer_text STRING,
thoughts ARRAY<STRUCT<type: STRING, content: STRING>>,
queries ARRAY<STRUCT<attachment_id: STRING, title: STRING, sql: STRING, statement_id: STRING, row_count: BIGINT>>,
agent_steps ARRAY<STRUCT<type: STRING, name: STRING, arguments: STRING, output: STRING>>,
feedback_rating STRING, feedback_comment STRING,
feedback_notes ARRAY<STRUCT<comment_id: STRING, user_id: STRING, comment_type: STRING, content: STRING, created_ts: TIMESTAMP>>,
raw_json STRING, ingested_at TIMESTAMP"""

# Resolve user_id -> email via SCIM. Needed because audit has no create event for questions routed
# from Genie One (and audit lags), so the audit email can be missing.
email_by_uid = {}
for uid in {r["user_id"] for r in rows if r["user_id"]}:
    try:
        u = w.users.get(uid)
        email_by_uid[uid] = u.user_name or next((e.value for e in (u.emails or []) if e.value), None)
    except Exception as e:  # deleted user / service principal / no SCIM read
        print(f"user lookup failed for {uid}: {str(e)[:120]}")
for r in rows:
    r["scim_email"] = email_by_uid.get(r["user_id"])
schema += ", scim_email STRING"

spark.createDataFrame(rows, schema).createOrReplaceTempView("api_msgs")
print(f"{len(rows)} message(s) flattened")

# COMMAND ----------

# --- enrich from system tables + MERGE ------------------------------------
min_date = min((r["created_ts"] for r in rows if r["created_ts"]), default=ingested_at).date() - dt.timedelta(days=1)

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {TGT}.message_trace (
  space_id STRING, space_title STRING, conversation_id STRING, conversation_type STRING, message_id STRING,
  user_id STRING, user_email STRING, created_ts TIMESTAMP, last_updated_ts TIMESTAMP, status STRING, error STRING,
  prompt_text STRING, answer_text STRING,
  thoughts ARRAY<STRUCT<type: STRING, content: STRING>>,
  queries ARRAY<STRUCT<attachment_id: STRING, title: STRING, sql: STRING, statement_id: STRING, row_count: BIGINT>>,
  agent_steps ARRAY<STRUCT<type: STRING, name: STRING, arguments: STRING, output: STRING>>,
  feedback_rating STRING, feedback_comment STRING, feedback_ts TIMESTAMP,
  feedback_notes ARRAY<STRUCT<comment_id: STRING, user_id: STRING, comment_type: STRING, content: STRING, created_ts: TIMESTAMP>>,
  exec ARRAY<STRUCT<statement_id: STRING, executed_by: STRING, executed_as: STRING, start_time: TIMESTAMP,
                    duration_ms: BIGINT, read_rows: BIGINT, produced_rows: BIGINT, warehouse_id: STRING, status: STRING>>,
  lineage_sources ARRAY<STRUCT<name: STRING, type: STRING>>,
  audit_create_ts TIMESTAMP, audit_create_action STRING, source_ip STRING, user_agent STRING,
  raw_json STRING, ingested_at TIMESTAMP)
CLUSTER BY (space_id, created_ts)
COMMENT 'One row per Genie message: prompt, answer, reasoning, SQL, execution, lineage, feedback, audit.'""")

# schema evolution for tables created by earlier versions of this notebook
if "feedback_notes" not in spark.table(f"{TGT}.message_trace").columns:
    spark.sql(f"""ALTER TABLE {TGT}.message_trace ADD COLUMNS (
      feedback_notes ARRAY<STRUCT<comment_id: STRING, user_id: STRING, comment_type: STRING, content: STRING, created_ts: TIMESTAMP>>
      AFTER feedback_ts)""")

spark.sql(f"""
CREATE OR REPLACE TEMP VIEW enriched AS
WITH stmts AS (
  SELECT m.message_id, q.statement_id FROM api_msgs m LATERAL VIEW explode(m.queries) t AS q WHERE q.statement_id IS NOT NULL),
ex AS (
  SELECT s.message_id,
         collect_list(named_struct('statement_id', h.statement_id, 'executed_by', h.executed_by, 'executed_as', h.executed_as,
           'start_time', h.start_time, 'duration_ms', h.total_duration_ms, 'read_rows', h.read_rows,
           'produced_rows', h.produced_rows, 'warehouse_id', h.compute.warehouse_id, 'status', h.execution_status)) AS exec
  FROM stmts s JOIN system.query.history h
    ON h.statement_id = s.statement_id AND h.start_time >= DATE'{min_date}'
  GROUP BY s.message_id),
lin AS (
  SELECT s.message_id,
         array_distinct(collect_list(named_struct('name', l.source_table_full_name, 'type', l.source_type))) AS lineage_sources
  FROM stmts s JOIN system.access.table_lineage l
    ON l.statement_id = s.statement_id AND l.event_date >= DATE'{min_date}'
  WHERE l.source_table_full_name IS NOT NULL
  GROUP BY s.message_id),
aud AS (
  SELECT coalesce(request_params.message_id, get_json_object(response.result, '$.message_id')) AS message_id,
         event_time, action_name, user_identity.email AS email, source_ip_address, user_agent
  FROM system.access.audit
  WHERE service_name = 'aibiGenie' AND event_date >= DATE'{min_date}'
    AND request_params.space_id = '{SPACE_ID}'
    AND action_name IN ('createConversationMessage','genieCreateConversationMessage','genieStartConversationMessage',
                        'createAgenticResponse','genieCreateAgenticResponse','updateConversationMessageFeedback')),
cre AS (
  SELECT message_id, min_by(struct(event_time, action_name, email, source_ip_address, user_agent), event_time) AS c
  FROM aud WHERE action_name <> 'updateConversationMessageFeedback' GROUP BY message_id),
fbk AS (
  SELECT message_id, max(event_time) AS feedback_ts, max_by(email, event_time) AS email
  FROM aud WHERE action_name = 'updateConversationMessageFeedback' GROUP BY message_id)
SELECT m.space_id, m.space_title, m.conversation_id, m.conversation_type, m.message_id, m.user_id,
       coalesce(cre.c.email, fbk.email, m.scim_email) AS user_email,
       m.created_ts, m.last_updated_ts, m.status, m.error, m.prompt_text, m.answer_text,
       m.thoughts, m.queries, m.agent_steps, m.feedback_rating, m.feedback_comment,
       CASE WHEN m.feedback_rating IS NOT NULL THEN fbk.feedback_ts END AS feedback_ts,
       m.feedback_notes,
       ex.exec, lin.lineage_sources,
       cre.c.event_time AS audit_create_ts, cre.c.action_name AS audit_create_action,
       cre.c.source_ip_address AS source_ip, cre.c.user_agent AS user_agent,
       m.raw_json, m.ingested_at
FROM api_msgs m
LEFT JOIN ex  ON ex.message_id  = m.message_id
LEFT JOIN lin ON lin.message_id = m.message_id
LEFT JOIN cre ON cre.message_id = m.message_id
LEFT JOIN fbk ON fbk.message_id = m.message_id
""")

# Keep previously-captured enrichment if this run's system-table lookup comes back empty
spark.sql(f"""
MERGE INTO {TGT}.message_trace t
USING enriched s ON t.message_id = s.message_id
WHEN MATCHED THEN UPDATE SET
  t.last_updated_ts = s.last_updated_ts, t.status = s.status, t.error = s.error, t.answer_text = s.answer_text,
  t.thoughts = s.thoughts, t.queries = s.queries, t.agent_steps = s.agent_steps,
  t.feedback_rating = s.feedback_rating, t.feedback_comment = s.feedback_comment,
  t.feedback_ts = coalesce(s.feedback_ts, t.feedback_ts), t.feedback_notes = s.feedback_notes,
  t.user_email = coalesce(s.user_email, t.user_email),
  t.exec = coalesce(s.exec, t.exec), t.lineage_sources = coalesce(s.lineage_sources, t.lineage_sources),
  t.audit_create_ts = coalesce(s.audit_create_ts, t.audit_create_ts),
  t.audit_create_action = coalesce(s.audit_create_action, t.audit_create_action),
  t.source_ip = coalesce(s.source_ip, t.source_ip), t.user_agent = coalesce(s.user_agent, t.user_agent),
  t.raw_json = s.raw_json, t.ingested_at = s.ingested_at
WHEN NOT MATCHED THEN INSERT *
""")

# COMMAND ----------

summary = spark.sql(f"""
SELECT count(*) messages,
       count_if(size(queries) > 0) with_sql,
       count_if(exec IS NOT NULL) with_exec,
       count_if(lineage_sources IS NOT NULL) with_lineage,
       count_if(audit_create_ts IS NOT NULL) with_audit,
       count_if(feedback_rating IS NOT NULL) with_feedback,
       count_if(exists(feedback_notes, n -> n.content IS NOT NULL)) with_feedback_notes
FROM {TGT}.message_trace WHERE message_id IN (SELECT message_id FROM api_msgs)""").first().asDict()
print(summary)
dbutils.notebook.exit(json.dumps({"space": SPACE_TITLE, "conversations": len(convs), **summary}))
