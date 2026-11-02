import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "crm_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("AUTH_SECRET muss gesetzt sein (mind. 32 Zeichen).");
  }
  return new TextEncoder().encode(raw);
}

export async function isLoggedIn(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

/** In jeder Server Action / Route aufrufen – Server Functions sind per POST direkt erreichbar. */
export async function requireAuth() {
  if (!(await isLoggedIn())) redirect("/login");
}

export async function createSession() {
  const token = await new SignJWT({ u: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}
