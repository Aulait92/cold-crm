"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { logout } from "@/app/actions";

const LINKS = [
  { href: "/", label: "Heute" },
  { href: "/aufgaben", label: "Aufgaben" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/kontakte", label: "Kontakte" },
  { href: "/import", label: "Import & Instantly" },
];

export function Nav({ dueCount }: { dueCount: number }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-4 py-2">
        <span className="mr-4 font-semibold tracking-tight">Cold CRM</span>
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm",
                active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {l.label}
              {l.href === "/aufgaben" && dueCount > 0 && (
                <span className={clsx("badge", active ? "bg-white text-slate-900" : "bg-rose-600 text-white")}>{dueCount}</span>
              )}
            </Link>
          );
        })}
        <form action={logout} className="ml-auto">
          <button className="text-sm text-slate-500 hover:text-slate-900">Abmelden</button>
        </form>
      </div>
    </header>
  );
}
