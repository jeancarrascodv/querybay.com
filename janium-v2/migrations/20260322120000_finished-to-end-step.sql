-- Move all Finished contacts back to EndStep, setting their step_id to the
-- last step in their campaign (i.e. the step with no outgoing links).
-- Finished = 32767 (i16::MAX), EndStep = 3
UPDATE campaign_contact cc
SET status = 3,
    step_id = terminal.step_id
FROM (
  SELECT DISTINCT ON (cs.campaign_id) cs.id AS step_id, cs.campaign_id
  FROM campaign_step cs
  WHERE NOT EXISTS (
    SELECT 1 FROM campaign_step_link csl
    WHERE csl.prev = cs.id AND csl.campaign_id = cs.campaign_id
  )
  ORDER BY cs.campaign_id, cs.priority
) terminal
WHERE cc.status = 32767
  AND cc.campaign_id = terminal.campaign_id;
