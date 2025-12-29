import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v5.2.0/index.ts";

/**
 * Apple Sign in with Apple - Server-to-Server Notification Handler
 *
 * This endpoint receives notifications from Apple when:
 * - User revokes consent (consent-revoked)
 * - User deletes their Apple account (account-delete / account-deleted)
 * - User changes email forwarding preferences (email-enabled / email-disabled)
 *
 * Required for Korean developers by January 1, 2026 per Korean privacy law compliance.
 *
 * Apple sends a POST request with a JWT in the request body.
 * The JWT must be verified using Apple's public keys.
 */

// Apple's OIDC configuration endpoint
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";

// Cache for Apple's public keys (JWKs)
let cachedJWKS: jose.JSONWebKeySet | null = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Event types from Apple
type AppleEventType =
  | "consent-revoked"    // User revoked consent for the app
  | "account-delete"     // User deleted their Apple account (documented)
  | "account-deleted"    // User deleted their Apple account (actual)
  | "email-enabled"      // User enabled email forwarding
  | "email-disabled";    // User disabled email forwarding

interface AppleServerNotificationEvent {
  type: AppleEventType;
  sub: string;  // Apple user ID
  email?: string;
  is_private_email?: boolean;
  event_time: number;
}

interface AppleNotificationPayload {
  iss: string;  // https://appleid.apple.com
  aud: string;  // Your app's bundle ID
  iat: number;  // Issued at timestamp
  jti: string;  // Unique identifier
  events: string;  // JSON string of events
}

/**
 * Fetch Apple's public keys (JWKS)
 */
async function getApplePublicKeys(): Promise<jose.JSONWebKeySet> {
  const now = Date.now();

  // Return cached keys if still valid
  if (cachedJWKS && (now - jwksCacheTime) < JWKS_CACHE_TTL) {
    return cachedJWKS;
  }

  console.log("[Apple Notification] Fetching Apple public keys...");

  const response = await fetch(APPLE_KEYS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Apple keys: ${response.status}`);
  }

  cachedJWKS = await response.json();
  jwksCacheTime = now;

  console.log("[Apple Notification] Apple public keys cached");
  return cachedJWKS!;
}

/**
 * Verify Apple's JWT notification
 */
async function verifyAppleJWT(token: string): Promise<AppleNotificationPayload> {
  const jwks = await getApplePublicKeys();

  // Decode the header to get the key ID (kid)
  const protectedHeader = jose.decodeProtectedHeader(token);
  const kid = protectedHeader.kid;

  if (!kid) {
    throw new Error("JWT missing key ID (kid)");
  }

  // Find the matching key
  const key = jwks.keys.find((k) => k.kid === kid);
  if (!key) {
    // Key not found - might need to refresh cache
    cachedJWKS = null;
    const refreshedJwks = await getApplePublicKeys();
    const refreshedKey = refreshedJwks.keys.find((k) => k.kid === kid);
    if (!refreshedKey) {
      throw new Error(`Key with kid ${kid} not found in Apple JWKS`);
    }
  }

  // Import the public key
  const publicKey = await jose.importJWK(
    jwks.keys.find((k) => k.kid === kid)!,
    protectedHeader.alg || "RS256"
  );

  // Verify the JWT
  const { payload } = await jose.jwtVerify(token, publicKey, {
    issuer: "https://appleid.apple.com",
    // audience is your bundle ID - validated separately
  });

  return payload as unknown as AppleNotificationPayload;
}

/**
 * Handle consent revoked or account deletion events
 * Deletes all user data associated with the Apple ID
 */
async function handleUserDeletion(
  supabase: ReturnType<typeof createClient>,
  appleUserId: string,
  eventType: string
): Promise<{ success: boolean; message: string }> {
  console.log(`[Apple Notification] Processing ${eventType} for Apple user: ${appleUserId}`);

  try {
    // Find the user by their Apple provider ID in auth.users
    // Apple stores the user's Apple ID in the user's identities
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error("[Apple Notification] Error listing users:", authError);
      throw authError;
    }

    // Find user with matching Apple identity
    const user = authUsers.users.find((u) => {
      const appleIdentity = u.identities?.find(
        (i) => i.provider === "apple" && i.id === appleUserId
      );
      return !!appleIdentity;
    });

    if (!user) {
      console.log(`[Apple Notification] No user found with Apple ID: ${appleUserId}`);
      return { success: true, message: "User not found - may have already been deleted" };
    }

    const userId = user.id;
    console.log(`[Apple Notification] Found Supabase user: ${userId}`);

    // Delete user profile (cascade will handle related data)
    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      console.error("[Apple Notification] Error deleting profile:", profileError);
      // Continue to delete auth user even if profile deletion fails
    }

    // Delete the auth user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("[Apple Notification] Error deleting auth user:", deleteError);
      throw deleteError;
    }

    console.log(`[Apple Notification] Successfully deleted user: ${userId}`);
    return { success: true, message: `User ${userId} deleted successfully` };

  } catch (error) {
    console.error("[Apple Notification] User deletion failed:", error);
    return { success: false, message: String(error) };
  }
}

/**
 * Handle email preference change events
 */
async function handleEmailChange(
  supabase: ReturnType<typeof createClient>,
  appleUserId: string,
  eventType: string,
  isPrivateEmail?: boolean
): Promise<{ success: boolean; message: string }> {
  console.log(`[Apple Notification] Processing ${eventType} for Apple user: ${appleUserId}`);

  try {
    // Find the user by their Apple provider ID
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      throw authError;
    }

    const user = authUsers.users.find((u) => {
      const appleIdentity = u.identities?.find(
        (i) => i.provider === "apple" && i.id === appleUserId
      );
      return !!appleIdentity;
    });

    if (!user) {
      console.log(`[Apple Notification] No user found with Apple ID: ${appleUserId}`);
      return { success: true, message: "User not found" };
    }

    const userId = user.id;

    // Update user's email preference in profile
    const emailEnabled = eventType === "email-enabled";

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        apple_email_relay_enabled: emailEnabled,
        apple_private_email: isPrivateEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      console.error("[Apple Notification] Error updating profile:", updateError);
      // This might fail if columns don't exist - that's okay
    }

    console.log(`[Apple Notification] Email ${emailEnabled ? "enabled" : "disabled"} for user: ${userId}`);
    return { success: true, message: `Email preference updated for user ${userId}` };

  } catch (error) {
    console.error("[Apple Notification] Email change handling failed:", error);
    return { success: false, message: String(error) };
  }
}

Deno.serve(async (req: Request) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Get the JWT from the request body
    // Apple sends it as: { "payload": "<JWT>" }
    const body = await req.json();
    const token = body.payload;

    if (!token) {
      console.error("[Apple Notification] No payload in request body");
      return new Response(
        JSON.stringify({ error: "Missing payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("[Apple Notification] Received notification, verifying JWT...");

    // Verify the JWT
    const payload = await verifyAppleJWT(token);

    console.log("[Apple Notification] JWT verified successfully");
    console.log("[Apple Notification] Issuer:", payload.iss);
    console.log("[Apple Notification] Audience:", payload.aud);

    // Validate audience (should be your app's bundle ID)
    const expectedAudience = "com.daydate.app";
    if (payload.aud !== expectedAudience) {
      console.error(`[Apple Notification] Invalid audience: ${payload.aud}, expected: ${expectedAudience}`);
      return new Response(
        JSON.stringify({ error: "Invalid audience" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse the events
    const events: AppleServerNotificationEvent = JSON.parse(payload.events);
    console.log("[Apple Notification] Event type:", events.type);
    console.log("[Apple Notification] Apple user ID:", events.sub);

    // Initialize Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Handle different event types
    let result: { success: boolean; message: string };

    switch (events.type) {
      case "consent-revoked":
      case "account-delete":
      case "account-deleted":
        // User revoked consent or deleted their Apple account
        // Must delete all user data per Korean privacy law
        result = await handleUserDeletion(supabase, events.sub, events.type);
        break;

      case "email-enabled":
      case "email-disabled":
        // User changed email forwarding preferences
        result = await handleEmailChange(
          supabase,
          events.sub,
          events.type,
          events.is_private_email
        );
        break;

      default:
        console.log(`[Apple Notification] Unknown event type: ${events.type}`);
        result = { success: true, message: `Unknown event type: ${events.type}` };
    }

    // Log the result for monitoring
    console.log("[Apple Notification] Processing result:", result);

    // Always return 200 to Apple (they retry on non-200)
    return new Response(
      JSON.stringify({ success: true, result }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Apple Notification] Error processing notification:", error);

    // Return 200 even on error to prevent Apple from retrying indefinitely
    // Log the error for investigation
    return new Response(
      JSON.stringify({
        success: false,
        error: String(error),
        message: "Error logged for investigation"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
