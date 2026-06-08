-- Apply AFTER 001_initial.sql and 002_ghost_runs_rls_fix.sql

CREATE TABLE friend_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One row per directed pair; to re-request after decline, DELETE the old row first
  UNIQUE(from_id, to_id)
);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "see own requests"
  ON friend_requests FOR SELECT
  USING (from_id = auth.uid() OR to_id = auth.uid());

CREATE POLICY "send friend request"
  ON friend_requests FOR INSERT
  WITH CHECK (from_id = auth.uid());

CREATE POLICY "respond to incoming request"
  ON friend_requests FOR UPDATE
  USING (to_id = auth.uid())
  WITH CHECK (status IN ('accepted', 'declined'));

CREATE POLICY "cancel own pending request"
  ON friend_requests FOR DELETE
  USING (from_id = auth.uid() AND status = 'pending');
