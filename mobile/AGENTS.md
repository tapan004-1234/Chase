@CLAUDE.md

# Expo SDK Version

This project runs **Expo SDK 54**. Read the SDK 54 docs before writing any code:
https://docs.expo.dev/versions/v54.0.0/

Do not reference SDK 56 APIs — the app is intentionally pinned to SDK 54
because that is the version currently published to the Expo Go App Store.

# Setup (first time)

1. `cd mobile && npm install`
2. Copy `.env.example` to `.env` and fill in your Supabase credentials
3. Apply `../supabase/migrations/001_initial.sql` in the Supabase SQL Editor
4. Apply `../supabase/migrations/002_ghost_runs_rls_fix.sql` in the Supabase SQL Editor
5. Apply `../supabase/migrations/003_friends.sql` in the Supabase SQL Editor
6. Apply `../supabase/migrations/004_lobbies.sql` in the Supabase SQL Editor
7. Apply `../supabase/migrations/005_elo_trigger.sql` in the Supabase SQL Editor
8. Apply `../supabase/migrations/006_tag_challenges.sql` in the Supabase SQL Editor
9. Apply `../supabase/migrations/007_username_onboarding.sql` in the Supabase SQL Editor
10. Apply `../supabase/migrations/008_bounty_mode.sql` in the Supabase SQL Editor
11. `npx expo start --clear`
11. Scan the QR code in Expo Go (App Store, install "Expo Go" first)
