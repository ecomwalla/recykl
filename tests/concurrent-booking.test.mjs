// Proves the core booking guarantee: two agents racing for the last unit of
// a lot can never both win. Run with:
//   npm run test:concurrency
//
// Creates its own throwaway data (product, lot, two agent accounts) against
// the real Supabase project and cleans all of it up afterward, so re-running
// doesn't accumulate junk.
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL, SERVICE_KEY);

async function createAgent(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "concurrency-test-pw",
    email_confirm: true,
    user_metadata: { role: "agent" },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  // The on_auth_user_created trigger creates the profiles row; upsert in case
  // this test runs against a database from before that trigger existed.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: data.user.id, role: "agent" });
  if (profileError) throw new Error(`profile ${email}: ${profileError.message}`);

  const client = createClient(URL, ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: "concurrency-test-pw",
  });
  if (signInError) throw new Error(`signIn ${email}: ${signInError.message}`);
  return { id: data.user.id, client };
}

test("two simultaneous bookings for the last unit: exactly one succeeds", async () => {
  let productId, lotId;
  const agents = [];

  try {
    // A lot with exactly ONE unit available, priced and active.
    const { data: product, error: productError } = await admin
      .from("products")
      .insert({
        brand: "TEST",
        model: "Race Condition",
        grade: "A",
        spec: "concurrency test",
        owner_type: "house",
      })
      .select()
      .single();
    if (productError) throw new Error(productError.message);
    productId = product.id;

    const { data: lot, error: lotError } = await admin
      .from("stock_lots")
      .insert({
        product_id: productId,
        quantity_total: 1,
        quantity_available: 1,
        price_per_unit: 100,
        grade: "A",
        location: "test",
        status: "active",
      })
      .select()
      .single();
    if (lotError) throw new Error(lotError.message);
    lotId = lot.id;

    agents.push(await createAgent("race-agent-1@recykl.test"));
    agents.push(await createAgent("race-agent-2@recykl.test"));

    // Fire both bookings at the same instant.
    const results = await Promise.all(
      agents.map(({ client }) =>
        client.rpc("book_lot", { p_lot_id: lotId, p_quantity: 1 }),
      ),
    );

    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);

    console.log(`    outcome 1: ${results[0].error?.message ?? "booked OK"}`);
    console.log(`    outcome 2: ${results[1].error?.message ?? "booked OK"}`);

    assert.equal(succeeded.length, 1, "exactly one booking must succeed");
    assert.equal(failed.length, 1, "exactly one booking must fail");
    // The loser can be rejected for either reason depending on whether the
    // winner's booking depleted the lot: "Not enough quantity available" if
    // units remained, "Lot is not active" if the lot flipped to depleted.
    assert.match(
      failed[0].error.message,
      /Not enough quantity available|Lot is not active/,
      "the loser must fail with a lost-the-race error",
    );

    // The lot must end fully reserved: 0 available, 1 reserved, depleted.
    const { data: finalLot } = await admin
      .from("stock_lots")
      .select("quantity_available, quantity_reserved, quantity_sold, status")
      .eq("id", lotId)
      .single();
    assert.equal(finalLot.quantity_available, 0);
    assert.equal(finalLot.quantity_reserved, 1);
    assert.equal(finalLot.quantity_sold, 0);
    assert.equal(finalLot.status, "depleted");

    // Exactly one booking row exists for this lot.
    const { count } = await admin
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("lot_id", lotId);
    assert.equal(count, 1, "exactly one booking row must exist");
  } finally {
    // Clean up everything this test created, regardless of pass/fail.
    if (lotId) {
      await admin.from("bookings").delete().eq("lot_id", lotId);
      await admin.from("stock_lots").delete().eq("id", lotId);
    }
    if (productId) await admin.from("products").delete().eq("id", productId);
    for (const agent of agents) {
      await admin.auth.admin.deleteUser(agent.id);
    }
  }
});
