// Verifies the signup trigger: a new user with role metadata gets the right
// profile, and a forged 'admin' request is downgraded to 'agent'. The trigger
// fires on the auth.users insert itself, so the logic tested here is exactly
// what a public signUp call goes through. (Public signUp rejects .test email
// domains, so this uses the admin API to create the users.)
//   node --env-file=.env.local scripts/verify-signup-trigger.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const cases = [
  { email: "trigger-seller@recykl.test", requested: "seller", expected: "seller" },
  { email: "trigger-agent@recykl.test", requested: "agent", expected: "agent" },
  { email: "trigger-forged@recykl.test", requested: "admin", expected: "agent" },
];

const ids = [];
try {
  for (const { email, requested, expected } of cases) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "trigger-test-pw",
      email_confirm: true,
      user_metadata: { role: requested },
    });
    if (error) throw new Error(`${email}: ${error.message}`);
    ids.push(data.user.id);

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    const ok = profile?.role === expected;
    console.log(
      `signup requesting "${requested}" -> profile role "${profile?.role}" ${ok ? "✓" : "✗ WRONG"}`,
    );
    if (!ok) process.exitCode = 1;
  }
} finally {
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}
