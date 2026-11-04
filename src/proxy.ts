import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/instantly/webhook", "/api/waalaxy/webhook", "/api/calendly/webhook", "/api/leads/webhook", "/api/linkedin/message", "/favicon.ico"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const token = req.cookies.get("crm_session")?.value;
  const raw = process.env.AUTH_SECRET;
  if (token && raw) {
    try {
      await jwtVerify(token, new TextEncoder().encode(raw));
      return NextResponse.next();
    } catch {}
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
