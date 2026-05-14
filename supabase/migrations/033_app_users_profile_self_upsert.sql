-- /account/profile on hoopbase needs each signed-in user to be able to
-- create AND update their own app_users row. Existing policies cover
-- SELECT (012) and UPDATE-own-row (012); INSERT was missing because
-- legacy creation went through the upsert-user Edge Function only.
--
-- Also add a `notification_prefs jsonb` column so the granular notification
-- toggles (team_chat / schedule_changes / game_updates / email_notifs)
-- have a home that syncs across devices, replacing the old AppSettings-row
-- pattern that doesn't exist on the hoopbase shell.

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{}'::jsonb;

DROP POLICY IF EXISTS "users insert own row" ON public.app_users;
CREATE POLICY "users insert own row" ON public.app_users
  FOR INSERT TO authenticated
  WITH CHECK (lower(email) = lower(auth.jwt() ->> 'email'));
