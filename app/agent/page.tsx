import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AgentPortal({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; booked?: string }>;
}) {
  const { error: errorMessage, booked } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The .eq() filter is for clarity only — the real guarantee that agents
  // never see pending_pricing lots is the RLS policy on stock_lots, which
  // applies to every query this user makes, including direct API calls.
  const { data: lots } = await supabase
    .from("stock_lots")
    .select("*, products(brand, model, spec)")
    .eq("status", "active")
    .order("uploaded_at", { ascending: false });

  async function bookLot(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { error } = await supabase.rpc("book_lot", {
      p_lot_id: String(formData.get("lot_id")),
      p_quantity: Number(formData.get("quantity")),
    });
    if (error) redirect(`/agent?error=${encodeURIComponent(error.message)}`);
    revalidatePath("/agent");
    redirect("/agent?booked=1");
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
        <h1 className="text-2xl font-semibold tracking-tight">Agent portal</h1>
        <form action={signOut}>
          <button className="text-sm text-zinc-500 underline">Sign out</button>
        </form>
      </div>

      {errorMessage && (
        <p className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          Booking failed: {errorMessage}
        </p>
      )}
      {booked && (
        <p className="rounded border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
          Booking confirmed — quantity is held for 15 minutes.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Available lots</h2>
        {!lots?.length && (
          <p className="text-zinc-500">No active lots right now.</p>
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
              <span className="text-sm font-medium">
                {lot.price_per_unit} {lot.currency}/unit
              </span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {lot.quantity_available} available · grade {lot.grade} ·{" "}
              {lot.location}
            </p>
            <form action={bookLot} className="flex gap-2">
              <input type="hidden" name="lot_id" value={lot.id} />
              <input
                name="quantity"
                type="number"
                min="1"
                max={lot.quantity_available}
                required
                placeholder="Quantity"
                className="w-32 rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button className="rounded bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black">
                Book
              </button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
