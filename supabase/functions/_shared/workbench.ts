import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

/**
 * Returns true when a value is a plain record.
 * @param value - Unknown value to inspect.
 * @returns Whether the value is a record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalizes a Workbench username for comparisons and account creation.
 * @param value - Unknown username input.
 * @returns The normalized username or an empty string.
 */
export function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Returns true when a normalized Workbench username is valid.
 * @param username - Normalized username.
 * @returns Whether the username matches the account policy.
 */
export function isValidUsername(username: string): boolean {
  return usernamePattern.test(username);
}

/**
 * Maps a Workbench username to its internal Supabase Auth email address.
 * @param username - Normalized Workbench username.
 * @returns The internal Auth email address.
 */
export function usernameToEmail(username: string): string {
  const domain = Deno.env.get("WORKBENCH_ACCOUNT_EMAIL_DOMAIN")?.trim() ||
    "accounts.powersource.work";
  return `${username}@${domain}`;
}

/**
 * Generates a high-entropy invitation code suitable for one-time display.
 * @returns A URL-safe invitation code.
 */
export function createInvitationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
}

/**
 * Hashes an invitation code before it is stored or queried.
 * @param code - Raw invitation code.
 * @returns The lowercase SHA-256 digest.
 */
export async function hashInvitationCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Creates a consistent JSON error response.
 * @param code - Stable client-facing error code.
 * @param status - HTTP status code.
 * @returns The JSON error response.
 */
export function errorResponse(code: string, status: number): Response {
  return Response.json({ code }, { headers: corsHeaders, status });
}

/**
 * Creates a JSON response with the function CORS contract.
 * @param value - JSON-serializable response value.
 * @param status - HTTP status code.
 * @returns The JSON response.
 */
export function jsonResponse(value: unknown, status: number): Response {
  return Response.json(value, { headers: corsHeaders, status });
}

/**
 * Creates the response for a browser CORS preflight request.
 * @returns The CORS preflight response.
 */
export function optionsResponse(): Response {
  return new Response("ok", { headers: corsHeaders });
}

/**
 * Creates a server-only client that supports current and legacy Supabase keys.
 * @returns A privileged Supabase client.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const serverKey = Deno.env.get("SUPABASE_SECRET_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    "";
  if (!supabaseUrl || !serverKey) {
    throw new Error("missing_supabase_server_configuration");
  }
  return createClient<Database>(supabaseUrl, serverKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Compares two API keys without an early-return value comparison.
 * @param left - First API key.
 * @param right - Second API key.
 * @returns Whether the key values match.
 */
async function constantTimeEqual(
  left: string,
  right: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0 && left.length === right.length;
}

/**
 * Validates a current publishable key or legacy anonymous key from a client request.
 * @param request - Incoming Edge Function request.
 * @returns Whether the request supplies the configured public key.
 */
export async function hasValidPublicKey(request: Request): Promise<boolean> {
  const suppliedKey = request.headers.get("apikey") ?? "";
  const configuredKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim() ||
    Deno.env.get("SUPABASE_ANON_KEY")?.trim() ||
    "";
  return Boolean(suppliedKey && configuredKey) &&
    constantTimeEqual(suppliedKey, configuredKey);
}
