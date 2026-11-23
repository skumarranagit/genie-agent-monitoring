-- @param conversation_id STRING
SELECT message_id, created_ts, substr(prompt_text, 1, 200) AS prompt_preview, coalesce(feedback_rating, 'NONE') AS rating
FROM main.genie_monitoring.message_trace
WHERE conversation_id = :conversation_id
ORDER BY created_ts;
