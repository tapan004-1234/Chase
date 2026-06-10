-- 009_tag_invites.sql
-- Enables direct 1v1 Tag challenges from the friends list without requiring
-- the host to manually create a lobby first. A tag_invite links two users
-- to a lobby so the recipient can accept in-app rather than scanning a QR code.

CREATE TABLE IF NOT EXISTS tag_invites (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  from_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lobby_code  text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

ALTER TABLE tag_invites ENABLE ROW LEVEL SECURITY;

-- Sender and recipient can read/write the row
CREATE POLICY "tag_invites_own" ON tag_invites
  FOR ALL USING (auth.uid() = from_id OR auth.uid() = to_id);

-- Subscribe to real-time INSERT events so the recipient sees the invite instantly
ALTER PUBLICATION supabase_realtime ADD TABLE tag_invites;
