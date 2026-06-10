-- ELO update trigger (K=32, ghost mode)
-- Fires on ghost_challenges UPDATE when status transitions to 'completed'.
-- Updates both profiles.ghost_rating and inserts two ratings_history rows.
-- Runs SECURITY DEFINER so it bypasses RLS and can write for both players.

CREATE OR REPLACE FUNCTION public.handle_ghost_challenge_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- Only fire on transition TO 'completed'
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.winner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ghost_rating INTO challenger_rating FROM profiles WHERE id = NEW.challenger_id;
  SELECT ghost_rating INTO opponent_rating   FROM profiles WHERE id = NEW.opponent_id;

  challenger_won  := (NEW.winner_id = NEW.challenger_id);
  expected_score  := 1.0 / (1.0 + POWER(10.0, (opponent_rating - challenger_rating) / 400.0));
  challenger_delta := ROUND(k_factor * (CASE WHEN challenger_won THEN 1.0 ELSE 0.0 END - expected_score));
  opponent_delta   := -challenger_delta;

  UPDATE profiles SET ghost_rating = ghost_rating + challenger_delta WHERE id = NEW.challenger_id;
  UPDATE profiles SET ghost_rating = ghost_rating + opponent_delta   WHERE id = NEW.opponent_id;

  INSERT INTO ratings_history (user_id, mode, old_rating, new_rating, delta, challenge_id)
  VALUES
    (NEW.challenger_id, 'ghost', challenger_rating, challenger_rating + challenger_delta, challenger_delta, NEW.id),
    (NEW.opponent_id,   'ghost', opponent_rating,   opponent_rating   + opponent_delta,   opponent_delta,   NEW.id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_ghost_challenge_completed
  AFTER UPDATE ON ghost_challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_ghost_challenge_complete();
