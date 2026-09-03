import {
  createInvitationCode,
  hashInvitationCode,
  hasValidPublicKey,
  isPlatformAdminMetadata,
  isValidUsername,
  normalizeUsername,
} from "./workbench.ts";

/** Throws when a test condition is false. */
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("normalizes and validates Workbench usernames", () => {
  assert(
    normalizeUsername("  Team.User ") === "team.user",
    "Username normalization failed",
  );
  assert(isValidUsername("team.user"), "Expected username to be valid");
  assert(!isValidUsername("A"), "Expected short username to be invalid");
});

Deno.test("creates and hashes high-entropy invitation codes", async () => {
  const code = createInvitationCode();
  const firstHash = await hashInvitationCode(code);
  const secondHash = await hashInvitationCode(code);
  assert(code.length >= 40, "Invitation code is too short");
  assert(firstHash.length === 64, "Invitation hash has an invalid length");
  assert(firstHash === secondHash, "Invitation hashing is not deterministic");
});

Deno.test("treats super_admin as a platform administrator", () => {
  assert(isPlatformAdminMetadata({ role: "super_admin" }), "Expected super_admin");
  assert(isPlatformAdminMetadata({ role: "system_admin" }), "Expected system_admin");
  assert(!isPlatformAdminMetadata({ role: "member" }), "Expected member to be rejected");
});

Deno.test("accepts only the configured public API key", async () => {
  const previousKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  Deno.env.set("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_value");
  try {
    const accepted = await hasValidPublicKey(
      new Request("https://example.com", {
        headers: { apikey: "sb_publishable_test_value" },
      }),
    );
    const rejected = await hasValidPublicKey(
      new Request("https://example.com", {
        headers: { apikey: "sb_publishable_wrong_value" },
      }),
    );
    assert(accepted, "Expected configured key to be accepted");
    assert(!rejected, "Expected unknown key to be rejected");
  } finally {
    if (previousKey) Deno.env.set("SUPABASE_PUBLISHABLE_KEY", previousKey);
    else Deno.env.delete("SUPABASE_PUBLISHABLE_KEY");
  }
});
