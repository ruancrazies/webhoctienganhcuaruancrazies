import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Chạy trước mỗi request: làm mới phiên Supabase (ghi lại cookie) và chặn người chưa đăng nhập.
 * Đây là lớp tiện lợi; lớp bảo vệ thật là requireUser()/requireUserId() ở mã server (ADR-1).
 */
const PUBLIC_PAGES = ["/login", "/register", "/forgot", "/reset", "/verify"];
const GUEST_ONLY = ["/login", "/register"]; // đã đăng nhập thì không cần vào

const matches = (pathname: string, list: string[]) => list.some((p) => pathname === p || pathname.startsWith(p + "/"));

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (xem .env.example)");

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const { pathname, search } = request.nextUrl;

  // Chuyển hướng nhưng giữ cookie phiên vừa làm mới.
  const redirectTo = (target: string) => {
    const res = NextResponse.redirect(new URL(target, request.url));
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    response.headers.forEach((v, k) => {
      if (k.toLowerCase().startsWith("cache-control") || k.toLowerCase() === "expires" || k.toLowerCase() === "pragma") {
        res.headers.set(k, v);
      }
    });
    return res;
  };

  if (user && matches(pathname, GUEST_ONLY)) return redirectTo("/");

  if (!user && !matches(pathname, PUBLIC_PAGES)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }

  return response;
}

export const config = {
  // Bỏ qua tệp tĩnh và endpoint hook (hook tự kiểm tra chữ ký, không có phiên người dùng).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth/send-email|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
