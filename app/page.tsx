import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Recykl
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        B2B marketplace platform
      </p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded bg-black px-5 py-2.5 text-white dark:bg-white dark:text-black"
        >
          Log in
        </Link>
        <Link
          href="/agent"
          className="rounded border border-zinc-300 px-5 py-2.5 dark:border-zinc-700"
        >
          Agent portal
        </Link>
        <Link
          href="/seller"
          className="rounded border border-zinc-300 px-5 py-2.5 dark:border-zinc-700"
        >
          Seller portal
        </Link>
      </div>
    </div>
  );
}
