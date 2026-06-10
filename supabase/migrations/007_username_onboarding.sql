-- Track whether the user has explicitly chosen a username.
-- FALSE (default) = still using the auto-generated email prefix → show onboarding screen.
-- TRUE = user picked their handle → skip onboarding.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_set BOOLEAN NOT NULL DEFAULT FALSE;
