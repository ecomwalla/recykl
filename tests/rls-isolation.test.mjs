// Proves cross-tenant isolation is enforced by the DATABASE (RLS), using
// anon-key clients signed in as real users -- the exact same access path as
// any direct API call. Run with: npm test
//
// Creates throwaway users/data and cleans all of it up afterward.
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PASSWORD = "rls-isolation-test-pw";

async function createUser(email, role) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  // Trigger creates the profile; upsert to force the exact role (needed for
  // 'admin', which the trigger refuses to self-assign).
  await admin.from("profiles").upsert({ id: data.user.id, role });

  const client = createClient(URL, ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw new Error(`signIn ${email}: ${signInError.message}`);
  return { id: data.user.id, client };
}

test("RLS: sellers, agents, and admin see exactly what they should", async () => {
  const users = [];
  let lotId, productId, bookingId;

  try {
    const sellerA = await createUser("rls-seller-a@recykl.test", "seller");
    const sellerB = await createUser("rls-seller-b@recykl.test", "seller");
    const agent1 = await createUser("rls-agent-1@recykl.test", "agent");
    const agent2 = await createUser("rls-agent-2@recykl.test", "agent");
    const adminUser = await createUser("rls-admin@recykl.test", "admin");
    users.push(sellerA, sellerB, agent1, agent2, adminUser);

    const { data: product } = await admin
      .from("products")
      .insert({
        brand: "TEST",
        model: "RLS Isolation",
        grade: "A",
        spec: "rls test",
        owner_type: "seller",
      })
      .select()
      .single();
    productId = product.id;

    // --- Seller A creates a lot (as themselves, via the public API) ---
    const { data: lot, error: lotError } = await sellerA.client
      .from("stock_lots")
      .insert({
        seller_id: sellerA.id,
        product_id: productId,
        quantity_total: 5,
        quantity_available: 5,
        grade: "A",
        location: "rls-test",
      })
      .select()
      .single();
    assert.ifError(lotError);
    lotId = lot.id;

    // --- 1. Seller B cannot fetch seller A's lot ---
    const { data: bSeesLot } = await sellerB.client
      .from("stock_lots")
      .select("*")
      .eq("id", lotId);
    assert.equal(
      bSeesLot.length,
      0,
      "seller B must NOT be able to fetch seller A's lot",
    );
    console.log("    1. seller B fetching seller A's lot by id: 0 rows ✓");

    // --- 2. Seller B cannot update seller A's lot ---
    const { data: bUpdated } = await sellerB.client
      .from("stock_lots")
      .update({ price_per_unit: 0.01, status: "active" })
      .eq("id", lotId)
      .select();
    assert.equal(
      bUpdated?.length ?? 0,
      0,
      "seller B's update of seller A's lot must affect 0 rows",
    );
    console.log("    2. seller B updating seller A's lot: 0 rows affected ✓");

    // --- Seller A prices + activates, agent 1 books ---
    await sellerA.client
      .from("stock_lots")
      .update({ price_per_unit: 10, status: "active" })
      .eq("id", lotId);
    const { data: booking, error: bookError } = await agent1.client.rpc(
      "book_lot",
      { p_lot_id: lotId, p_quantity: 2 },
    );
    assert.ifError(bookError);
    bookingId = booking.id;

    // --- 3. Agent 2 cannot see agent 1's booking ---
    const { data: otherAgentSees } = await agent2.client
      .from("bookings")
      .select("*")
      .eq("id", bookingId);
    assert.equal(
      otherAgentSees.length,
      0,
      "agent 2 must NOT see agent 1's booking",
    );
    console.log("    3. agent 2 fetching agent 1's booking: 0 rows ✓");

    // --- 4. Seller B cannot see the booking either (not their lot) ---
    const { data: sellerBSeesBooking } = await sellerB.client
      .from("bookings")
      .select("*")
      .eq("id", bookingId);
    assert.equal(sellerBSeesBooking.length, 0);
    console.log("    4. seller B fetching that booking: 0 rows ✓");

    // --- 5. Seller A CAN see it (order on their lot) ---
    const { data: sellerASeesBooking } = await sellerA.client
      .from("bookings")
      .select("*")
      .eq("id", bookingId);
    assert.equal(
      sellerASeesBooking.length,
      1,
      "seller A must see the booking on their own lot",
    );
    console.log("    5. seller A sees the order on their lot: 1 row ✓");

    // --- 6. Admin sees the lot AND the booking ---
    const { data: adminLot } = await adminUser.client
      .from("stock_lots")
      .select("*")
      .eq("id", lotId);
    const { data: adminBooking } = await adminUser.client
      .from("bookings")
      .select("*")
      .eq("id", bookingId);
    assert.equal(adminLot.length, 1, "admin must see the lot");
    assert.equal(adminBooking.length, 1, "admin must see the booking");
    console.log("    6. admin sees both the lot and the booking ✓");
  } finally {
    if (bookingId) await admin.from("bookings").delete().eq("id", bookingId);
    if (lotId) await admin.from("stock_lots").delete().eq("id", lotId);
    if (productId) await admin.from("products").delete().eq("id", productId);
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
  }
});
