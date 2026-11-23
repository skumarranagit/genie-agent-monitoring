-- @param space_id STRING
SELECT coalesce(user_email, user_id) AS user_key, count(*) AS messages
FROM main.genie_monitoring.message_trace
WHERE (:space_id = '' OR space_id = :space_id)
GROUP BY 1
ORDER BY messages DESC;
