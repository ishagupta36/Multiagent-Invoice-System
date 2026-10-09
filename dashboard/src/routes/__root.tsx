import { Outlet, Link, createRootRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { InvoiceDrawer } from "@/components/app/InvoiceDrawer";
import { cn } from "@/lib/utils";
import logo from "@/assets/acme-logo.png";
import { fmt0, periods, type Period, type Role } from "@/lib/data";

export const Route = createRootRoute({
  component: () => (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  ),
  notFoundComponent: () => (
    <div className="p-10">
      <h1 className="font-serif text-2xl">Page not found</h1>
      <Link to="/" className="mt-3 inline-block text-link underline">Back to command center</Link>
    </div>
  ),
});

const nav = [
  { to: "/", label: "Command center" },
  { to: "/inbox", label: "Review inbox" },
  { to: "/payments", label: "Payments" },
  { to: "/exceptions", label: "Exceptions" },
  { to: "/masters", label: "Database" },
] as const;

function Shell() {
  const { invoices, role, present } = useStore();
  const open = invoices.filter((i) => i.status === "review" && i.destination.includes(role)).length;
  return (
    <div className="flex min-h-screen">
      {!present && <aside className="sticky top-0 flex h-screen w-[250px] shrink-0 flex-col bg-ink text-ink-foreground">
        <div className="flex items-center gap-2.5 border-b border-ink-foreground/15 px-4 py-4">
          <img src={logo} alt="Acme Corp logo" width={36} height={36} className="h-9 w-9" />
          <div>
            <div className="font-serif text-[36px] leading-none">Acme Corp</div>
          </div>
        </div>
        <nav className="flex flex-col py-3">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="flex items-center justify-between border-l-2 border-transparent px-5 py-2 text-[13px] opacity-75 hover:opacity-100"
              activeProps={{ className: "!border-link bg-ink-foreground/10 !opacity-100" }}
            >
              {n.label}
              {n.to === "/inbox" && open > 0 && <span className="text-[11px] opacity-80">{open}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-5 py-4 text-[11px] opacity-50">{invoices.length} invoices in timeline</div>
      </aside>}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 px-8 py-6">
          <Outlet />
        </main>
      </div>
      <InvoiceDrawer />
    </div>
  );
}

function TopBar() {
  const { role, setRole, all: invoices, open, period, setPeriod, present, setPresent } = useStore();
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return invoices.filter((i) => i.number.toLowerCase().includes(s) || (i.vendorName ?? "").toLowerCase().includes(s)).slice(0, 8);
  }, [q, invoices]);
  const pick = (n: string) => { open(n); setQ(""); };
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-4 border-b bg-card px-8">
      <div className="flex border">
        {(["VP", "CFO"] as Role[]).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={cn("px-3 py-1 text-[12px] font-medium", role === r ? "bg-ink text-ink-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {r}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
        Timeline
        <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="h-8 border border-input bg-card px-2 text-[12.5px] font-medium text-foreground outline-none focus:border-link">
          {periods.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
        </select>
      </label>
      <div className="relative w-[300px]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && results[0]) pick(results[0].number); }}
          placeholder="Search invoice number or vendor"
          className="h-8 w-full border border-input bg-background px-2.5 text-[12.5px] outline-none focus:border-link"
        />
        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-9 z-30 border bg-popover shadow-sm">
            {results.map((r) => (
              <button key={r.number} onClick={() => pick(r.number)} className="flex w-full justify-between px-3 py-1.5 text-left text-[12.5px] hover:bg-accent">
                <span><span className="font-medium">{r.number}</span> <span className="text-muted-foreground">{r.vendorName ?? "Vendor missing"}</span></span>
                <span>{fmt0(r.total)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={() => setPresent(!present)} className={cn("ml-auto cursor-pointer rounded-full border-2 px-4 py-1.5 text-[12.5px] font-semibold shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-sm", present ? "border-link bg-link text-ink-foreground" : "border-ink bg-card text-ink hover:bg-ink hover:text-ink-foreground")}>{present ? "Exit present" : "▶ Present"}</button>
      <div className="text-[12px] text-muted-foreground">As of 4 Oct 2026 · Acting as <span className="font-medium text-foreground">{role}</span></div>
    </header>
  );
}
