-- Fix: opponents couldn't read the challenger's ghost_run when viewing incoming challenges.
-- The original policy only allowed owner reads. Add a second policy so the run is visible
-- to anyone who is an opponent in a challenge that references it.

CREATE POLICY "ghost_runs_select_as_opponent"
    ON ghost_runs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM ghost_challenges
            WHERE ghost_challenges.challenger_run_id = ghost_runs.id
              AND ghost_challenges.opponent_id = auth.uid()
        )
    );
