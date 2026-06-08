-- Chase — initial schema
-- Run: supabase db push  (or supabase db test to validate RLS)

-- ──────────────────────────────────────────────
-- ENUMS
-- ──────────────────────────────────────────────

CREATE TYPE challenge_status AS ENUM ('pending', 'completed', 'expired');
CREATE TYPE game_mode        AS ENUM ('ghost', 'tag');

-- ──────────────────────────────────────────────
-- TABLES
-- ──────────────────────────────────────────────

-- Extends auth.users (created automatically on first sign-in via trigger below)
CREATE TABLE profiles (
    id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username         TEXT        UNIQUE NOT NULL,
    ghost_rating     INTEGER     NOT NULL DEFAULT 1000,
    tag_rating       INTEGER     NOT NULL DEFAULT 1000,
    apns_device_token TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ghost_runs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    distance_km         FLOAT8      NOT NULL,
    duration_s          INTEGER     NOT NULL,
    avg_pace_s_per_km   FLOAT8      NOT NULL,
    gps_points          JSONB       NOT NULL DEFAULT '[]',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ghost_challenges (
    id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    challenger_id     UUID           NOT NULL REFERENCES profiles(id),
    opponent_id       UUID           NOT NULL REFERENCES profiles(id),
    challenger_run_id UUID           NOT NULL REFERENCES ghost_runs(id),
    opponent_run_id   UUID           REFERENCES ghost_runs(id),  -- NULL until opponent completes
    winner_id         UUID           REFERENCES profiles(id),
    status            challenge_status NOT NULL DEFAULT 'pending',
    expires_at        TIMESTAMPTZ    NOT NULL,
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE ratings_history (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    mode         game_mode   NOT NULL,
    old_rating   INTEGER     NOT NULL,
    new_rating   INTEGER     NOT NULL,
    delta        INTEGER     NOT NULL,
    challenge_id UUID        REFERENCES ghost_challenges(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- INDEXES
-- ──────────────────────────────────────────────

CREATE INDEX idx_ghost_runs_user_id
    ON ghost_runs(user_id);

CREATE INDEX idx_ghost_challenges_opponent_status
    ON ghost_challenges(opponent_id, status);

CREATE INDEX idx_ghost_challenges_challenger_status
    ON ghost_challenges(challenger_id, status);

CREATE INDEX idx_ratings_history_user_id
    ON ratings_history(user_id);

-- ──────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────

ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghost_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghost_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings_history  ENABLE ROW LEVEL SECURITY;

-- profiles: public read, owner write
CREATE POLICY "profiles_select"
    ON profiles FOR SELECT USING (true);

CREATE POLICY "profiles_insert"
    ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update"
    ON profiles FOR UPDATE USING (auth.uid() = id);

-- ghost_runs: owner only
CREATE POLICY "ghost_runs_select"
    ON ghost_runs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ghost_runs_insert"
    ON ghost_runs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ghost_runs_update"
    ON ghost_runs FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "ghost_runs_delete"
    ON ghost_runs FOR DELETE USING (auth.uid() = user_id);

-- ghost_challenges: challenger or opponent can read; only challenger can insert
CREATE POLICY "ghost_challenges_select"
    ON ghost_challenges FOR SELECT
    USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

CREATE POLICY "ghost_challenges_insert"
    ON ghost_challenges FOR INSERT
    WITH CHECK (auth.uid() = challenger_id);

-- Opponent updates their run result; challenger can expire their own challenge
CREATE POLICY "ghost_challenges_update"
    ON ghost_challenges FOR UPDATE
    USING (auth.uid() = opponent_id OR auth.uid() = challenger_id);

-- ratings_history: owner read only; writes are service-role only (Edge Functions bypass RLS)
CREATE POLICY "ratings_history_select"
    ON ratings_history FOR SELECT USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────
-- AUTO-CREATE PROFILE ON SIGNUP
-- The email prefix is used as the initial username.
-- The onboarding flow lets the user change it before it's shown to anyone.
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, username)
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'username',
            split_part(NEW.email, '@', 1)
        )
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ──────────────────────────────────────────────
-- SCHEDULED JOB: expire stale challenges
-- Run from Supabase dashboard → Database → Cron Jobs (pg_cron):
--   SELECT cron.schedule('expire-challenges', '*/15 * * * *',
--     $$UPDATE ghost_challenges
--       SET status = 'expired'
--       WHERE status = 'pending' AND expires_at < NOW()$$);
-- ──────────────────────────────────────────────
