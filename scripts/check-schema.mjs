// One-off read-only sanity check that the schema landed. Run with:
//   node --env-file=.env.local scripts/check-schema.mjs
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: products, error: productsError } = await admin
  .from("products")
  .select("brand, model, grade");
console.log("products:", productsError ?? products);

for (const table of ["profiles", "stock_lots", "bookings"]) {
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true });
  console.log(`${table}:`, error ? error.message : `exists (${count} rows)`);
}

const { data: rpcData, error: rpcError } = await admin.rpc("book_lot", {
  p_lot_id: "00000000-0000-0000-0000-000000000000",
  p_quantity: 1,
});
console.log(
  "book_lot function:",
  rpcError?.message === "Lot not found"
    ? "exists (correctly rejected a fake lot id)"
    : (rpcError?.message ?? rpcData),
);
