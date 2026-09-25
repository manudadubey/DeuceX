-- Fix: onboarding step 4 and Settings > Agents wrote agent_schedules rows
-- named 'mindset', but the Mindset Coach runner, its pickup pause check,
-- the console and the paused notice all read 'mindset-coach'. A player who
-- turned the Mindset Coach off kept getting daily insights. The app now
-- writes 'mindset-coach' (AGENT_NAMES in @deucex/shared); this moves the
-- existing rows across.
--
-- Where a player has both rows, the merged row is paused if either was: an
-- explicit "off" from the player is never silently undone. Data only; no
-- schema change.

update public.agent_schedules n
set paused = n.paused or o.paused, updated_at = now()
from public.agent_schedules o
where o.agent_name = 'mindset'
  and n.agent_name = 'mindset-coach'
  and n.player_id = o.player_id;

delete from public.agent_schedules o
where o.agent_name = 'mindset'
  and exists (
    select 1 from public.agent_schedules n
    where n.player_id = o.player_id and n.agent_name = 'mindset-coach'
  );

update public.agent_schedules
set agent_name = 'mindset-coach', updated_at = now()
where agent_name = 'mindset';
