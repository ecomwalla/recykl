import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SellerPortal() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: products } = await supabase
    .from("products")
    .select("id, brand, model, grade")
    .order("brand");

  const { data: lots } = await supabase
    .from("stock_lots")
    .select("*, products(brand, model)")
    .order("uploaded_at", { ascending: false });

  async function createLot(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const quantity = Number(formData.get("quantity"));
    const { error } = await supabase.from("stock_lots").insert({
      seller_id: user.id,
      product_id: String(formData.get("product_id")),
      quantity_total: quantity,
      quantity_available: quantity,
      grade: String(formData.get("grade")),
      location: String(formData.get("location")),
    });
    if (error) redirect(`/seller?error=${encodeURIComponent(error.message)}`);
    revalidatePath("/seller");
  }

  async function setPrice(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { error } = await supabase
      .from("stock_lots")
      .update({
        price_per_unit: Number(formData.get("price")),
        status: "active",
      })
      .eq("id", String(formData.get("lot_id")))
      .eq("seller_id", user.id);
    if (error) redirect(`/seller?error=${encodeURIComponent(error.message)}`);
    revalidatePath("/seller");
  }

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Seller portal</h1>
        <form action={signOut}>
          <button className="text-sm text-zinc-500 underline">Sign out</button>
        </form>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Create a stock lot</h2>
        <form action={createLot} className="flex flex-col gap-3">
          <select
            name="product_id"
            required
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Select a product…</option>
            {products?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.brand} {p.model} (grade {p.grade})
              </option>
            ))}
          </select>
          <input
            name="quantity"
            type="number"
            min="1"
            required
            placeholder="Quantity"
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            name="grade"
            required
            placeholder="Grade (e.g. A)"
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            name="location"
            required
            placeholder="Location (e.g. Dubai)"
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button className="self-start rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
            Create lot (starts unpriced)
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Your lots</h2>
        {!lots?.length && (
          <p className="text-zinc-500">No lots yet — create one above.</p>
        )}
        {lots?.map((lot) => (
          <div
            key={lot.id}
            className="flex flex-col gap-2 rounded border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {lot.products?.brand} {lot.products?.model}
              </span>
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-sm dark:bg-zinc-800">
                {lot.status}
              </span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {lot.quantity_available} of {lot.quantity_total} available ·
              grade {lot.grade} · {lot.location} ·{" "}
              {lot.price_per_unit
                ? `${lot.price_per_unit} ${lot.currency}/unit`
                : "no price set"}
            </p>
            {lot.status === "pending_pricing" && (
              <form action={setPrice} className="flex gap-2">
                <input type="hidden" name="lot_id" value={lot.id} />
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="Price per unit"
                  className="w-40 rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button className="rounded bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black">
                  Set price &amp; activate
                </button>
              </form>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
