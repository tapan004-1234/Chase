-- Tag lobbies: pre-game state for 1v1 Tag sessions
-- Apply AFTER 003_friends.sql

CREATE TABLE IF NOT EXISTS lobbies (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT        UNIQUE NOT NULL,
  host_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  guest_id         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  host_ready       BOOLEAN     NOT NULL DEFAULT FALSE,
  guest_ready      BOOLEAN     NOT NULL DEFAULT FALSE,
  duration_minutes INTEGER     NOT NULL DEFAULT 10,
  status           TEXT        NOT NULL DEFAULT 'waiting'
                               CHECK (status IN ('waiting', 'active', 'completed')),
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;

-- Host manages their own lobby
CREATE POLICY "host manages lobby"
  ON lobbies FOR ALL
  USING (host_id = auth.uid());

-- Guest can read any waiting lobby by code (needed for QR scan)
CREATE POLICY "read active lobby"
  ON lobbies FOR SELECT
  USING (expires_at > now());

-- Guest joins by updating guest_id
CREATE POLICY "guest joins lobby"
  ON lobbies FOR UPDATE
  USING (status = 'waiting' AND guest_id IS NULL)
  WITH CHECK (guest_id = auth.uid());

-- Guest updates ready state
CREATE POLICY "guest updates ready"
  ON lobbies FOR UPDATE
  USING (guest_id = auth.uid());

CREATE INDEX IF NOT EXISTS lobbies_code_idx ON lobbies (code);
CREATE INDEX IF NOT EXISTS lobbies_expires_idx ON lobbies (expires_at);

-- Enable Realtime for TagPreGameScreen subscription
ALTER PUBLICATION supabase_realtime ADD TABLE lobbies;
