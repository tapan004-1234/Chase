-- Tag challenge results + ELO trigger (K=32, tag mode)
-- UNIQUE(lobby_code): both players race to insert on Done tap — first writer wins,
-- second is silently ignored. This prevents double ELO updates.

CREATE TABLE IF NOT EXISTS tag_challenges (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_code TEXT        NOT NULL,
  police_id  UUID        NOT NULL REFERENCES profiles(id),
  thief_id   UUID        NOT NULL REFERENCES profiles(id),
  winner_id  UUID        NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lobby_code)
);

ALTER TABLE tag_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tag_challenges_select"
  ON tag_challenges FOR SELECT
  USING (auth.uid() = police_id OR auth.uid() = thief_id);

CREATE POLICY "tag_challenges_insert"
  ON tag_challenges FOR INSERT
  WITH CHECK (auth.uid() = police_id OR auth.uid() = thief_id);

-- ELO update: fires on INSERT (result is final at creation time, unlike ghost which updates)
CREATE OR REPLACE FUNCTION public.handle_tag_challenge_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  police_rating  INTEGER;
  thief_rating   INTEGER;
  police_won     BOOLEAN;
  k_factor       INTEGER := 32;
  expected_score FLOAT;
  police_delta   INTEGER;
  thief_delta    INTEGER;
BEGIN
  SELECT tag_rating INTO police_rating FROM profiles WHERE id = NEW.police_id;
  SELECT tag_rating INTO thief_rating  FROM profiles WHERE id = NEW.thief_id;

  police_won     := (NEW.winner_id = NEW.police_id);
  expected_score := 1.0 / (1.0 + POWER(10.0, (thief_rating - police_rating) / 400.0));
  police_delta   := ROUND(k_factor * (CASE WHEN police_won THEN 1.0 ELSE 0.0 END - expected_score));
  thief_delta    := -police_delta;

  UPDATE profiles SET tag_rating = tag_rating + police_delta WHERE id = NEW.police_id;
  UPDATE profiles SET tag_rating = tag_rating + thief_delta  WHERE id = NEW.thief_id;

  -- challenge_id is left NULL: ratings_history.challenge_id references ghost_challenges only
  INSERT INTO ratings_history (user_id, mode, old_rating, new_rating, delta, challenge_id)
  VALUES
    (NEW.police_id, 'tag', police_rating, police_rating + police_delta, police_delta, NULL),
    (NEW.thief_id,  'tag', thief_rating,  thief_rating  + thief_delta,  thief_delta,  NULL);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_tag_challenge_inserted
  AFTER INSERT ON tag_challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_tag_challenge_complete();
