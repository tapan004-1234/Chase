// update-ratings — compute ELO delta when a ghost challenge completes
//
// Webhook setup (Supabase dashboard → Database → Webhooks):
//   Table:   ghost_challenges
//   Events:  UPDATE
//   URL:     {SUPABASE_URL}/functions/v1/update-ratings
//   Headers: Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
//
// No additional env vars required beyond the standard Supabase ones.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: GhostChallenge;
  old_record?: GhostChallenge;
}

interface GhostChallenge {
  id: string;
  challenger_id: string;
  opponent_id: string;
  winner_id: string | null;
  status: "pending" | "completed" | "expired";
}

const K = 32;

function eloDeltas(
  rating1: number,
  rating2: number,
  player1Won: boolean
): { delta1: number; delta2: number; new1: number; new2: number } {
  const expected = 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));
  const score = player1Won ? 1 : 0;
  const delta1 = Math.round(K * (score - expected));
  const delta2 = -delta1;
  return { delta1, delta2, new1: rating1 + delta1, new2: rating2 + delta2 };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const payload: WebhookPayload = await req.json();
  const challenge = payload.record;
  const old = payload.old_record;

  // Only act when status just became "completed" and winner is set
  const justCompleted =
    old?.status !== "completed" &&
    challenge.status === "completed" &&
    challenge.winner_id !== null;

  if (!justCompleted) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch both players' current ghost_rating
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, ghost_rating")
    .in("id", [challenge.challenger_id, challenge.opponent_id]);

  if (profileErr || !profiles || profiles.length < 2) {
    console.error("Failed to fetch profiles:", profileErr);
    return new Response(JSON.stringify({ error: "profile_fetch_failed" }), {
      status: 500,
    });
  }

  const challengerProfile = profiles.find(
    (p) => p.id === challenge.challenger_id
  )!;
  const opponentProfile = profiles.find(
    (p) => p.id === challenge.opponent_id
  )!;

  const challengerWon = challenge.winner_id === challenge.challenger_id;

  const elo = eloDeltas(
    challengerProfile.ghost_rating,
    opponentProfile.ghost_rating,
    challengerWon
  );

  // Update ratings in parallel
  const [r1, r2] = await Promise.all([
    supabase
      .from("profiles")
      .update({ ghost_rating: elo.new1 })
      .eq("id", challenge.challenger_id),
    supabase
      .from("profiles")
      .update({ ghost_rating: elo.new2 })
      .eq("id", challenge.opponent_id),
  ]);

  if (r1.error || r2.error) {
    console.error("Rating update failed:", r1.error, r2.error);
    return new Response(JSON.stringify({ error: "rating_update_failed" }), {
      status: 500,
    });
  }

  // Insert ratings_history rows for both players
  const now = new Date().toISOString();
  const { error: histErr } = await supabase.from("ratings_history").insert([
    {
      user_id: challenge.challenger_id,
      mode: "ghost",
      old_rating: challengerProfile.ghost_rating,
      new_rating: elo.new1,
      delta: elo.delta1,
      challenge_id: challenge.id,
      created_at: now,
    },
    {
      user_id: challenge.opponent_id,
      mode: "ghost",
      old_rating: opponentProfile.ghost_rating,
      new_rating: elo.new2,
      delta: elo.delta2,
      challenge_id: challenge.id,
      created_at: now,
    },
  ]);

  if (histErr) {
    // Non-fatal — ratings already updated, history is best-effort
    console.error("ratings_history insert failed:", histErr);
  }

  return new Response(
    JSON.stringify({
      challenger: { id: challenge.challenger_id, delta: elo.delta1, new: elo.new1 },
      opponent: { id: challenge.opponent_id, delta: elo.delta2, new: elo.new2 },
    }),
    { status: 200 }
  );
});
