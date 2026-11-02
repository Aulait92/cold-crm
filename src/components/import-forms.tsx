"use client";

import { useActionState } from "react";
import { importContactsAction, importInstantlyAction, syncInstantlyAction, type ImportState } from "@/app/actions";

function Result({ state }: { state: ImportState }) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-600"}`}>{state.message}</p>;
}

export function ContactsImport() {
  const [state, action, pending] = useActionState(importContactsAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="file" name="file" accept=".csv,text/csv" className="input" required />
      <button className="btn-primary" disabled={pending}>{pending ? "Importiere … (kann 1 Min. dauern)" : "Agenturliste importieren"}</button>
      <Result state={state} />
    </form>
  );
}

export function InstantlySync({ hasKey }: { hasKey: boolean }) {
  const [state, action, pending] = useActionState(syncInstantlyAction, null);
  return (
    <form action={action} className="space-y-3">
      <button className="btn-primary" disabled={pending || !hasKey}>{pending ? "Synchronisiere …" : "Jetzt mit Instantly abgleichen"}</button>
      {!hasKey && <p className="text-sm text-amber-700">INSTANTLY_API_KEY ist nicht gesetzt.</p>}
      <Result state={state} />
    </form>
  );
}

export function InstantlyCsvImport() {
  const [state, action, pending] = useActionState(importInstantlyAction, null);
  return (
    <form action={action} className="space-y-3">
      <input name="campaign" placeholder="Kampagnenname (falls nicht in der CSV)" className="input" />
      <input type="file" name="file" accept=".csv,text/csv" className="input" required />
      <button className="btn-ghost" disabled={pending}>{pending ? "Importiere …" : "Instantly-CSV importieren"}</button>
      <Result state={state} />
    </form>
  );
}
