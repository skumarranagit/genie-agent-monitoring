-- @param space_id STRING
-- @param days INT
-- @param rating STRING
-- @param user_email STRING
-- @param search STRING
SELECT message_id,
       conversation_id,
       space_title,
       conversation_type,
       created_ts,
       coalesce(user_email, user_id) AS user_key,
       substr(prompt_text, 1, 300) AS prompt_preview,
       substr(answer_text, 1, 200) AS answer_preview,
       coalesce(feedback_rating, 'NONE') AS rating,
       exists(feedback_notes, n -> n.content IS NOT NULL) AS has_note,
       size(queries) AS sql_count,
       status,
       error IS NOT NULL AS has_error
FROM main.genie_monitoring.message_trace
WHERE (:space_id = '' OR space_id = :space_id)
  AND (:days = 0 OR created_ts >= current_timestamp() - make_dt_interval(:days))
  AND (:rating = '' OR coalesce(feedback_rating, 'NONE') = :rating)
  AND (:user_email = '' OR coalesce(user_email, user_id) = :user_email)
  AND (:search = '' OR lower(prompt_text) LIKE concat('%', lower(:search), '%'))
ORDER BY created_ts DESC
LIMIT 500;
