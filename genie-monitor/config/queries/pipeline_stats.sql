WITH t AS (
  SELECT count(*) AS messages,
         count(DISTINCT conversation_id) AS conversations,
         count(DISTINCT space_id) AS agents,
         count_if(exec IS NOT NULL) AS with_exec,
         count_if(lineage_sources IS NOT NULL) AS with_lineage,
         count_if(audit_create_ts IS NOT NULL) AS with_audit,
         count_if(exists(feedback_notes, n -> n.content IS NOT NULL)) AS with_notes,
         max(ingested_at) AS last_ingested_ts
  FROM main.genie_monitoring.message_trace
),
r AS (
  SELECT count(*) AS raw_payloads,
         count_if(endpoint = 'messages') AS raw_messages,
         count_if(endpoint = 'items') AS raw_items,
         count_if(endpoint = 'comments') AS raw_comments,
         count(DISTINCT ingested_at) AS ingest_runs
  FROM main.genie_monitoring.genie_api_raw
)
SELECT * FROM t CROSS JOIN r;
