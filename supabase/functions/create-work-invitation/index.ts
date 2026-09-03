import "@supabase/functions-js/edge-runtime.d.ts";
import {
  createAdminClient,
  createInvitationCode,
  errorResponse,
  hashInvitationCode,
  hasValidPublicKey,
  isRecord,
  isPlatformAdminMetadata,
  isValidUsername,
  jsonResponse,
  normalizeUsername,
  optionsResponse,
} from "../_shared/workbench.ts";

interface InvitationRequest {
  displayName: string;
  username: string;
}

/**
 * Parses and validates an invitation creation request.
 * @param request - Incoming Edge Function request.
 * @returns Validated invitation input or null.
 */
async function parseRequest(
  request: Request,
): Promise<InvitationRequest | null> {
  const value: unknown = await request.json().catch(() => null);
  if (!isRecord(value)) return null;
  const username = normalizeUsername(value.username);
  if (!isValidUsername(username)) return null;
  return {
    username,
    displayName: typeof value.displayName === "string"
      ? value.displayName.trim().slice(0, 120)
      : "",
  };
}

export default {
  /**
   * Creates a one-time invitation for an authenticated system administrator.
   * @param request - Incoming Edge Function request.
   * @returns The function response.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return optionsResponse();
    if (request.method !== "POST") {
      return errorResponse("method_not_allowed", 405);
    }
    if (!await hasValidPublicKey(request)) {
      return errorResponse("invalid_api_key", 401);
    }

    try {
      const authorization = request.headers.get("Authorization") ?? "";
      const accessToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
      if (!accessToken) return errorResponse("invalid_session", 401);

      const admin = createAdminClient();
      const { data: account, error: accountError } = await admin.auth.getUser(
        accessToken,
      );
      if (accountError || !account.user) {
        return errorResponse("invalid_session", 401);
      }
      if (!isPlatformAdminMetadata(account.user.app_metadata)) {
        return errorResponse("forbidden", 403);
      }

      const body = await parseRequest(request);
      if (!body) return errorResponse("invalid_username", 400);

      const { count: profileCount, error: profileError } = await admin
        .from("work_profiles")
        .select("id", { count: "exact", head: true })
        .eq("username", body.username);
      if (profileError) return errorResponse("internal_error", 500);
      if ((profileCount ?? 0) > 0) {
        return errorResponse("username_unavailable", 409);
      }

      const invitationCode = createInvitationCode();
      const tokenHash = await hashInvitationCode(invitationCode);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString();
      const { error: insertError } = await admin.from("work_invitations")
        .insert({
          created_by: account.user.id,
          display_name: body.displayName,
          expires_at: expiresAt,
          token_hash: tokenHash,
          username: body.username,
        });
      if (insertError?.code === "23505") {
        return errorResponse("username_unavailable", 409);
      }
      if (insertError) return errorResponse("internal_error", 500);

      return jsonResponse({
        invitationCode,
        expiresAt,
        username: body.username,
      }, 201);
    } catch {
      return errorResponse("internal_error", 500);
    }
  },
};
