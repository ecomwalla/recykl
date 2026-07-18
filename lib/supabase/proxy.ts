import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/agent", "/seller", "/admin"];

/**
 * Refreshes the Supabase session on every request and gates the three
 * portals behind "must be logged in". Splitting agent/seller/admin access
 * by role is a later step, once a `profiles` table with a `role` column
 * exists — see the TODO below.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    // Supabase keys haven't been added to .env.local yet — let every page
    // load instead of crashing, so the scaffold is browsable before setup
    // is finished. Once real keys are added, login-gating below kicks in.
    console.warn(
      "[proxy] Supabase env vars are missing — skipping auth check. See .env.local.example.",
    );
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedPath = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (isProtectedPath && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // TODO (next phase): once a `profiles` table with a `role` column exists,
  // look up the signed-in user's role here and redirect them away from any
  // portal that doesn't match (e.g. a seller hitting /admin gets sent back
  // to /seller instead of just being let through).

  return supabaseResponse;
}
