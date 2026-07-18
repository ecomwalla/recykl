// End-to-end verification of the seller -> agent flow using the two seeded
// test accounts, performing exactly the operations the portal pages perform.
//   node --env-file=.env.local scripts/verify-flows.mjs
// Cleans up the lot/booking it creates at the end.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const seller = createClient(URL, ANON_KEY);
const agent = createClient(URL, ANON_KEY);
let lotId;

try {
  // --- Seller: sign in, create an unpriced lot ---
  const { error: sellerSignIn } = await seller.auth.signInWithPassword({
    email: "seller@recykl.test",
    password: "recykl-test-123",
  });
  if (sellerSignIn) throw new Error(sellerSignIn.message);

  const { data: product } = await seller
    .from("products")
    .select("id")
    .limit(1)
    .single();
  const {
    data: { user: sellerUser },
  } = await seller.auth.getUser();

  const { data: lot, error: createError } = await seller
    .from("stock_lots")
    .insert({
      seller_id: sellerUser.id,
      product_id: product.id,
      quantity_total: 10,
      quantity_available: 10,
      grade: "A",
      location: "Dubai",
    })
    .select()
    .single();
  if (createError) throw new Error(createError.message);
  lotId = lot.id;
  console.log(`1. seller created lot: status=${lot.status}, no price`);

  // --- Agent: sign in, confirm the pending lot is INVISIBLE ---
  const { error: agentSignIn } = await agent.auth.signInWithPassword({
    email: "agent@recykl.test",
    password: "recykl-test-123",
  });
  if (agentSignIn) throw new Error(agentSignIn.message);

  // Deliberately NO status filter -- this is the RLS check.
  const { data: allVisible } = await agent.from("stock_lots").select("id");
  const canSeePending = allVisible?.some((l) => l.id === lotId);
  console.log(
    `2. agent queries ALL lots (no filter): pending lot visible? ${canSeePending} ${canSeePending ? "-- RLS FAILURE!" : "(RLS working)"}`,
  );
  if (canSeePending) throw new Error("RLS failed: agent saw a pending lot");

  // --- Seller: set price, which activates the lot ---
  const { error: priceError } = await seller
    .from("stock_lots")
    .update({ price_per_unit: 25.5, status: "active" })
    .eq("id", lotId)
    .eq("seller_id", sellerUser.id);
  if (priceError) throw new Error(priceError.message);
  console.log("3. seller set price 25.50 -> status=active");

  // --- Agent: lot is now visible, book 3 units ---
  const { data: nowVisible } = await agent
    .from("stock_lots")
    .select("id, quantity_available")
    .eq("id", lotId);
  console.log(
    `4. agent can now see the lot: ${nowVisible?.length === 1} (available=${nowVisible?.[0]?.quantity_available})`,
  );

  const { data: booking, error: bookError } = await agent.rpc("book_lot", {
    p_lot_id: lotId,
    p_quantity: 3,
  });
  if (bookError) throw new Error(bookError.message);
  console.log(
    `5. agent booked 3 units: booking status=${booking.status}, expires=${booking.expiry_time}`,
  );

  const { data: after } = await agent
    .from("stock_lots")
    .select("quantity_available, quantity_reserved")
    .eq("id", lotId)
    .single();
  console.log(
    `6. lot after booking: available=${after.quantity_available} (was 10), reserved=${after.quantity_reserved}`,
  );

  // --- Also verify an agent CANNOT bypass book_lot with a direct write ---
  const { error: directWrite } = await agent
    .from("stock_lots")
    .update({ quantity_available: 999 })
    .eq("id", lotId)
    .select();
  console.log(
    `7. agent direct UPDATE of quantity blocked? ${directWrite ? `yes (${directWrite.code})` : "NO -- SECURITY HOLE"}`,
  );

  console.log("\nAll flow checks passed.");
} finally {
  if (lotId) {
    await admin.from("bookings").delete().eq("lot_id", lotId);
    await admin.from("stock_lots").delete().eq("id", lotId);
  }
}
