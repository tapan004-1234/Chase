// notify-challenge — APNs push for ghost challenge events
//
// Trigger setup (Supabase dashboard → Database → Webhooks):
//   Table:  ghost_challenges
//   Events: INSERT, UPDATE
//   URL:    {SUPABASE_URL}/functions/v1/notify-challenge
//   Headers: Authorization: Bearer {SUPABASE_ANON_KEY}
//
// Required environment variables (set in Supabase dashboard → Edge Functions → Secrets):
//   APNS_KEY_ID       — 10-char key ID from Apple Developer portal
//   APNS_TEAM_ID      — 10-char Team ID from Apple Developer portal
//   APNS_BUNDLE_ID    — e.g. com.yourname.chase
//   APNS_PRIVATE_KEY  — contents of .p8 file, newlines as \n
//   APNS_PRODUCTION   — "true" for App Store / TestFlight; omit for sandbox

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

interface Profile {
  apns_device_token: string | null;
  username: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const payload: WebhookPayload = await req.json();
  const challenge = payload.record;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const notifications: Array<{ userId: string; body: string }> = [];

  if (payload.type === "INSERT") {
    // New challenge — notify the opponent
    notifications.push({
      userId: challenge.opponent_id,
      body: "You've been challenged to a Ghost run! Can you beat their time?",
    });
  } else if (
    payload.type === "UPDATE" &&
    payload.old_record?.status !== "completed" &&
    challenge.status === "completed"
  ) {
    // Challenge just resolved — notify both players
    const challengerWon = challenge.winner_id === challenge.challenger_id;
    notifications.push(
      {
        userId: challenge.challenger_id,
        body: challengerWon
          ? "Your Ghost record held — they couldn't beat it!"
          : "Your Ghost record was beaten!",
      },
      {
        userId: challenge.opponent_id,
        body: challengerWon
          ? "Close, but you didn't beat their record this time."
          : "You beat the Ghost! Their record is yours now.",
      }
    );
  }

  if (notifications.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  // Fetch APNs tokens for all recipients in one query
  const userIds = notifications.map((n) => n.userId);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, apns_device_token, username")
    .in("id", userIds);

  const tokenMap = new Map<string, Profile>(
    (profiles ?? []).map((p: Profile & { id: string }) => [p.id, p])
  );

  let sent = 0;
  for (const { userId, body } of notifications) {
    const profile = tokenMap.get(userId);
    if (!profile?.apns_device_token) continue;

    const ok = await sendAPNs(
      profile.apns_device_token,
      body,
      challenge.id,
      supabase,
      userId
    );
    if (ok) sent++;
  }

  return new Response(JSON.stringify({ sent }), { status: 200 });
});

async function sendAPNs(
  deviceToken: string,
  body: string,
  challengeId: string,
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  try {
    const jwt = await buildAPNsJWT();
    const host = Deno.env.get("APNS_PRODUCTION") === "true"
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";

    const res = await fetch(`${host}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": Deno.env.get("APNS_BUNDLE_ID")!,
        "apns-push-type": "alert",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        aps: { alert: { body }, sound: "default" },
        challenge_id: challengeId,
      }),
    });

    if (res.status === 410) {
      // Token is stale (device reinstalled / logged out) — clear it
      await supabase
        .from("profiles")
        .update({ apns_device_token: null })
        .eq("id", userId);
      return false;
    }

    return res.status === 200;
  } catch {
    return false;
  }
}

async function buildAPNsJWT(): Promise<string> {
  const keyId  = Deno.env.get("APNS_KEY_ID")!;
  const teamId = Deno.env.get("APNS_TEAM_ID")!;
  const pemRaw = Deno.env.get("APNS_PRIVATE_KEY")!.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const headerB64  = toBase64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claimsB64  = toBase64Url(JSON.stringify({ iss: teamId, iat: now }));
  const signingInput = `${headerB64}.${claimsB64}`;

  const pemBody = pemRaw
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${toBase64Url(sig)}`;
}

function toBase64Url(input: string | ArrayBuffer): string {
  const str =
    typeof input === "string"
      ? btoa(input)
      : btoa(String.fromCharCode(...new Uint8Array(input)));
  return str.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
