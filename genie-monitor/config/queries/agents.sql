SELECT space_id,
       max_by(space_title, created_ts) AS space_title,
       count(*) AS messages,
       max(created_ts) AS last_message_ts
FROM main.genie_monitoring.message_trace
GROUP BY space_id
ORDER BY last_message_ts DESC;
