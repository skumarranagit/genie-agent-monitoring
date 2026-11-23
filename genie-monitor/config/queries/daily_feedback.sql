-- @param space_id STRING
-- @param days INT
-- @param rating STRING
-- @param user_email STRING
-- @param search STRING
SELECT date_format(d, 'MMM d') AS day, positive, negative, no_rating
FROM (
  SELECT date_trunc('DAY', created_ts) AS d,
         count_if(feedback_rating = 'POSITIVE') AS positive,
         count_if(feedback_rating = 'NEGATIVE') AS negative,
         count_if(feedback_rating IS NULL) AS no_rating
  FROM main.genie_monitoring.message_trace
  WHERE (:space_id = '' OR space_id = :space_id)
  AND (:days = 0 OR created_ts >= current_timestamp() - make_dt_interval(:days))
  AND (:rating = '' OR coalesce(feedback_rating, 'NONE') = :rating)
  AND (:user_email = '' OR coalesce(user_email, user_id) = :user_email)
  AND (:search = '' OR lower(prompt_text) LIKE concat('%', lower(:search), '%'))
  GROUP BY 1
)
ORDER BY d;
