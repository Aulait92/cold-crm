"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-lg font-semibold">Cold CRM</h1>
        <div>
          <label className="label" htmlFor="password">Passwort</label>
          <input id="password" name="password" type="password" className="input" autoFocus required />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="btn-primary w-full" disabled={pending}>Anmelden</button>
      </form>
    </div>
  );
}
