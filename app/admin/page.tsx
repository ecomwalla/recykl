import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCommandCenter() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // These queries return ALL rows only because the caller is an admin --
  // the "admins can view all ..." RLS policies. Any other role running the
  // exact same queries gets only their own slice.
  const { data: lots } = await supabase
    .from("stock_lots")
    .select("*, products(brand, model)")
    .order("uploaded_at", { ascending: false });

  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .order("booked_at", { ascending: false });

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Admin command center
        </h1>
        <form action={signOut}>
          <button className="text-sm text-zinc-500 underline">Sign out</button>
        </form>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">All stock lots ({lots?.length ?? 0})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-zinc-500 dark:border-zinc-700">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Available</th>
                <th className="py-2 pr-4">Reserved</th>
                <th className="py-2 pr-4">Sold</th>
                <th className="py-2 pr-4">Price</th>
                <th className="py-2 pr-4">Location</th>
              </tr>
            </thead>
            <tbody>
              {lots?.map((lot) => (
                <tr
                  key={lot.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-2 pr-4">
                    {lot.products?.brand} {lot.products?.model}
                  </td>
                  <td className="py-2 pr-4">{lot.status}</td>
                  <td className="py-2 pr-4">{lot.quantity_available}</td>
                  <td className="py-2 pr-4">{lot.quantity_reserved}</td>
                  <td className="py-2 pr-4">{lot.quantity_sold}</td>
                  <td className="py-2 pr-4">
                    {lot.price_per_unit
                      ? `${lot.price_per_unit} ${lot.currency}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">{lot.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!lots?.length && <p className="py-2 text-zinc-500">No lots.</p>}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          All bookings ({bookings?.length ?? 0})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-zinc-500 dark:border-zinc-700">
                <th className="py-2 pr-4">Booked at</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Expires</th>
              </tr>
            </thead>
            <tbody>
              {bookings?.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-2 pr-4">
                    {new Date(b.booked_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">{b.quantity_booked}</td>
                  <td className="py-2 pr-4">{b.status}</td>
                  <td className="py-2 pr-4">
                    {b.expiry_time
                      ? new Date(b.expiry_time).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!bookings?.length && (
            <p className="py-2 text-zinc-500">No bookings.</p>
          )}
        </div>
      </section>
    </div>
  );
}
