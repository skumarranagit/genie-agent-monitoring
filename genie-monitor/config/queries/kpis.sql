-- @param space_id STRING
-- @param days INT
-- @param rating STRING
-- @param user_email STRING
-- @param search STRING
SELECT count(*) AS messages,
       count(DISTINCT conversation_id) AS conversations,
       count(DISTINCT coalesce(user_email, user_id)) AS users,
       count_if(feedback_rating = 'POSITIVE') AS thumbs_up,
       count_if(feedback_rating = 'NEGATIVE') AS thumbs_down,
       count_if(exists(feedback_notes, n -> n.content IS NOT NULL)) AS with_notes,
       count_if(status <> 'COMPLETED' OR error IS NOT NULL) AS failed,
       count_if(size(queries) > 0) AS with_sql,
       cast(percentile_approx(aggregate(exec, 0L, (acc, e) -> acc + coalesce(e.duration_ms, 0L)), 0.5) AS BIGINT) AS p50_sql_ms,
       max(ingested_at) AS last_ingested_ts,
       max(created_ts) AS last_message_ts
FROM main.genie_monitoring.message_trace
WHERE (:space_id = '' OR space_id = :space_id)
  AND (:days = 0 OR created_ts >= current_timestamp() - make_dt_interval(:days))
  AND (:rating = '' OR coalesce(feedback_rating, 'NONE') = :rating)
  AND (:user_email = '' OR coalesce(user_email, user_id) = :user_email)
  AND (:search = '' OR lower(prompt_text) LIKE concat('%', lower(:search), '%'));
