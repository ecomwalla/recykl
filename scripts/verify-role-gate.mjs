// Verifies the proxy role gate over real HTTP against the local dev server:
// signs in as the agent test account, then requests /seller with the session
// cookie and expects a redirect to /agent.
//   node --env-file=.env.local scripts/verify-role-gate.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = new globalThis.URL(URL).hostname.split(".")[0];

const client = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data, error } = await client.auth.signInWithPassword({
  email: "agent@recykl.test",
  password: "recykl-test-123",
});
if (error) throw new Error(error.message);

// Reproduce the cookie @supabase/ssr uses so the proxy sees this session.
const cookieValue =
  "base64-" +
  Buffer.from(JSON.stringify(data.session)).toString("base64url");
const cookie = `sb-${projectRef}-auth-token=${cookieValue}`;

for (const [path, expected] of [
  ["/seller", "/agent"], // wrong portal -> bounced to own portal
  ["/admin", "/agent"], // wrong portal -> bounced to own portal
  ["/agent", null], // own portal -> allowed through (200)
]) {
  const res = await fetch(`http://localhost:3000${path}`, {
    headers: { cookie },
    redirect: "manual",
  });
  const location = res.headers.get("location");
  const ok = expected ? location === expected : res.status === 200;
  console.log(
    `agent requests ${path}: ${res.status}${location ? ` -> ${location}` : ""} ${ok ? "✓" : "✗ UNEXPECTED"}`,
  );
  if (!ok) process.exitCode = 1;
}
