-- @param message_id STRING
SELECT message_id, conversation_id, space_id, space_title, conversation_type,
       created_ts, last_updated_ts, status, error,
       user_id, user_email, source_ip, user_agent, audit_create_ts, audit_create_action,
       prompt_text, answer_text,
       feedback_rating, feedback_comment, feedback_ts,
       to_json(coalesce(thoughts, array())) AS thoughts_json,
       to_json(coalesce(queries, array())) AS queries_json,
       to_json(coalesce(exec, array())) AS exec_json,
       to_json(coalesce(lineage_sources, array())) AS lineage_json,
       to_json(coalesce(feedback_notes, array())) AS notes_json,
       to_json(coalesce(agent_steps, array())) AS steps_json,
       ingested_at
FROM main.genie_monitoring.message_trace
WHERE message_id = :message_id;
