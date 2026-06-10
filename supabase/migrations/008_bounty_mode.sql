-- Migration 008: Bounty mode
-- Adds bounty_rating to profiles, creates bounty_challenges table with RLS,
-- adds ELO trigger for bounty completions, and drops the old ghost friend-challenge trigger.

-- ── 1. Add bounty_rating to profiles ────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bounty_rating INTEGER NOT NULL DEFAULT 1200;

-- ── 2. Create bounty_challenges table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS bounty_challenges (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id     UUID        NOT NULL REFERENCES profiles(id),
  opponent_id       UUID        REFERENCES profiles(id),       -- NULL = open to anyone
  challenger_run_id UUID        NOT NULL REFERENCES ghost_runs(id),
  opponent_run_id   UUID        REFERENCES ghost_runs(id),     -- NULL until someone responds
  winner_id         UUID        REFERENCES profiles(id),
  status            TEXT        NOT NULL DEFAULT 'pending',    -- pending | completed | expired
  is_public         BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bounty_status_check CHECK (status IN ('pending','completed','expired'))
);

ALTER TABLE bounty_challenges ENABLE ROW LEVEL SECURITY;

-- Anyone can see public bounties; participants can see private ones
CREATE POLICY "bounty_challenges_select" ON bounty_challenges
  FOR SELECT USING (
    is_public = true
    OR auth.uid() = challenger_id
    OR auth.uid() = opponent_id
  );

CREATE POLICY "bounty_challenges_insert" ON bounty_challenges
  FOR INSERT WITH CHECK (auth.uid() = challenger_id);

-- CRITICAL: open bounties have opponent_id = NULL, so any authenticated user
-- can claim them (set opponent_id). Restrict to status = 'pending' so completed
-- rows cannot be hijacked.
CREATE POLICY "bounty_challenges_update" ON bounty_challenges
  FOR UPDATE USING (
    (opponent_id IS NULL AND status = 'pending')   -- claiming an open bounty
    OR auth.uid() = opponent_id                    -- acceptor completing their run
    OR auth.uid() = challenger_id                  -- challenger managing their post
  );

-- ── 3. ELO trigger for bounty completions ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_bounty_challenge_complete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  challenger_rating INTEGER;
  opponent_rating   INTEGER;
  challenger_won    BOOLEAN;
  k_factor          INTEGER := 32;
  expected_score    FLOAT;
  challenger_delta  INTEGER;
  opponent_delta    INTEGER;
BEGIN
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF NEW.winner_id IS NULL OR NEW.opponent_id IS NULL THEN RETURN NEW; END IF;

  SELECT bounty_rating INTO challenger_rating FROM profiles WHERE id = NEW.challenger_id;
  SELECT bounty_rating INTO opponent_rating   FROM profiles WHERE id = NEW.opponent_id;

  challenger_won   := (NEW.winner_id = NEW.challenger_id);
  expected_score   := 1.0 / (1.0 + POWER(10.0, (opponent_rating - challenger_rating) / 400.0));
  challenger_delta := ROUND(k_factor * (CASE WHEN challenger_won THEN 1.0 ELSE 0.0 END - expected_score));
  opponent_delta   := -challenger_delta;

  UPDATE profiles SET bounty_rating = bounty_rating + challenger_delta WHERE id = NEW.challenger_id;
  UPDATE profiles SET bounty_rating = bounty_rating + opponent_delta   WHERE id = NEW.opponent_id;

  -- challenge_id is a FK to ghost_challenges — cannot store bounty IDs there.
  -- Migration 009 will add a bounty_challenge_id FK column to ratings_history.
  INSERT INTO ratings_history (user_id, mode, old_rating, new_rating, delta, challenge_id)
  VALUES
    (NEW.challenger_id, 'bounty', challenger_rating, challenger_rating + challenger_delta, challenger_delta, NULL),
    (NEW.opponent_id,   'bounty', opponent_rating,   opponent_rating   + opponent_delta,   opponent_delta,   NULL);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_bounty_challenge_completed
  AFTER UPDATE ON bounty_challenges
  FOR EACH ROW EXECUTE FUNCTION public.handle_bounty_challenge_complete();

-- ── 4. Drop the old ghost friend-challenge ELO trigger ──────────────────────
-- ghost_challenges was used for friend-challenges (now replaced by bounty_challenges).
-- Ghost self-challenges never wrote to ghost_challenges, so this trigger was
-- only firing for the friend-challenge flow we're retiring.
DROP TRIGGER IF EXISTS on_ghost_challenge_completed ON ghost_challenges;

-- Mark any lingering pending ghost_challenges as expired.
-- Without the trigger they can never complete; this prevents them showing as
-- stale "incoming challenges" if any client still queries that table.
UPDATE ghost_challenges SET status = 'expired' WHERE status = 'pending';
