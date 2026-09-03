import "@supabase/functions-js/edge-runtime.d.ts";
import {
  createAdminClient,
  errorResponse,
  hashInvitationCode,
  hasValidPublicKey,
  isRecord,
  isValidUsername,
  jsonResponse,
  normalizeUsername,
  optionsResponse,
  usernameToEmail,
} from "../_shared/workbench.ts";

interface ActivationRequest {
  invitationCode: string;
  password: string;
  username: string;
}

/**
 * Parses and validates an invitation activation request.
 * @param request - Incoming Edge Function request.
 * @returns Validated activation input or null.
 */
async function parseRequest(
  request: Request,
): Promise<ActivationRequest | null> {
  const value: unknown = await request.json().catch(() => null);
  if (!isRecord(value)) return null;
  const username = normalizeUsername(value.username);
  const invitationCode = typeof value.invitationCode === "string"
    ? value.invitationCode.trim()
    : "";
  const password = typeof value.password === "string" ? value.password : "";
  if (
    !isValidUsername(username) || invitationCode.length < 32 ||
    password.length < 10
  ) return null;
  return { invitationCode, password, username };
}

export default {
  /**
   * Creates a Supabase Auth account after validating a one-time invitation.
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
      const body = await parseRequest(request);
      if (!body) return errorResponse("invalid_invitation", 400);

      const admin = createAdminClient();
      const tokenHash = await hashInvitationCode(body.invitationCode);
      const { data: invitation, error: invitationError } = await admin
        .from("work_invitations")
        .select(
          "id, username, display_name, expires_at, accepted_at, revoked_at",
        )
        .eq("token_hash", tokenHash)
        .eq("username", body.username)
        .maybeSingle();
      const invalidInvitation = invitationError || !invitation ||
        invitation.accepted_at || invitation.revoked_at ||
        new Date(invitation?.expires_at ?? 0).getTime() <= Date.now();
      if (invalidInvitation) return errorResponse("invalid_invitation", 400);

      const { data: created, error: createError } = await admin.auth.admin
        .createUser({
          app_metadata: {
            display_name: invitation.display_name,
            role: "member",
            username: body.username,
          },
          email: usernameToEmail(body.username),
          email_confirm: true,
          password: body.password,
        });
      if (createError?.code === "email_exists" || createError?.status === 422) {
        return errorResponse("username_unavailable", 409);
      }
      if (createError || !created.user) {
        return errorResponse("internal_error", 500);
      }

      const { error: profileError } = await admin.from("work_profiles").insert({
        display_name: invitation.display_name,
        id: created.user.id,
        role: "member",
        username: body.username,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        const duplicateProfile = profileError.code === "23505";
        return errorResponse(
          duplicateProfile ? "username_unavailable" : "internal_error",
          duplicateProfile ? 409 : 500,
        );
      }

      const { data: accepted, error: acceptError } = await admin
        .from("work_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invitation.id)
        .is("accepted_at", null)
        .select("id")
        .maybeSingle();
      if (acceptError || !accepted) {
        await admin.auth.admin.deleteUser(created.user.id);
        return errorResponse("invalid_invitation", 409);
      }

      return jsonResponse({ activated: true }, 201);
    } catch {
      return errorResponse("internal_error", 500);
    }
  },
};
