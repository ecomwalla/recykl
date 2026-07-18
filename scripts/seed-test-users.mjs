// One-time script: creates two test accounts so you can try both portals.
//   node --env-file=.env.local scripts/seed-test-users.mjs
// Safe to re-run — skips accounts that already exist.
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const TEST_USERS = [
  { email: "seller@recykl.test", role: "seller" },
  { email: "agent@recykl.test", role: "agent" },
  { email: "admin@recykl.test", role: "admin" },
];
const PASSWORD = "recykl-test-123";

for (const { email, role } of TEST_USERS) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role },
  });

  if (error) {
    console.log(`${email}: ${error.message} (already exists? skipping)`);
    continue;
  }

  // The on_auth_user_created trigger already made a profiles row, but it
  // deliberately never grants 'admin' -- so set the intended role explicitly
  // here, where the service-role key (server-side trust) is required.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: created.user.id, role });

  console.log(
    profileError
      ? `${email}: user created but profile failed: ${profileError.message}`
      : `${email}: created with role "${role}"`,
  );
}

console.log(`\nBoth accounts use password: ${PASSWORD}`);
