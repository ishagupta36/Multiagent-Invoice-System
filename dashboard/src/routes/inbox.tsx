import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { ageDays, fmt0, type Invoice, type Severity } from "@/lib/data";
import { PageHeader, SevPill, StatusPill, td, th, sevRow } from "@/components/app/bits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inbox")({ component: Inbox });

type Tab = "mine" | "both" | "VP" | "CFO" | "closed";
const bands = [
  { k: "all", label: "Any amount", f: () => true },
  { k: "lt5", label: "Under $5k", f: (n: number) => n < 5000 },
  { k: "5to10", label: "$5–10k", f: (n: number) => n >= 5000 && n <= 10000 },
  { k: "10to25", label: "$10–25k", f: (n: number) => n > 10000 && n <= 25000 },
  { k: "gt25", label: "Over $25k", f: (n: number) => n > 25000 },
];

function Inbox() {
  const { invoices, role, open, openId } = useStore();
  const [tab, setTab] = useState<Tab>("mine");
  const [band, setBand] = useState("all");
  const [sev, setSev] = useState<Severity | "all">("all");
  const [vendor, setVendor] = useState("all");

  const review = invoices.filter((i) => i.status === "review");
  const closed = invoices.filter((i) => i.reviewedBy !== null);
  const base: Record<Tab, Invoice[]> = {
    mine: review.filter((i) => i.destination.includes(role)),
    both: review.filter((i) => i.destination.length > 1),
    VP: review.filter((i) => i.destination.includes("VP")),
    CFO: review.filter((i) => i.destination.includes("CFO")),
    closed,
  };
  const rows = useMemo(() => {
    const bf = bands.find((b) => b.k === band)!.f;
    return base[tab]
      .filter((i) => bf(i.total) && (sev === "all" || i.severity === sev) && (vendor === "all" || (i.vendorName ?? "Vendor missing") === vendor))
      .sort((a, b) => Number(b.destination[0] === role) - Number(a.destination[0] === role) || b.total - a.total);
  }, [tab, band, sev, vendor, invoices, role]);
  const vendorOpts = [...new Set([...review, ...closed].map((i) => i.vendorName ?? "Vendor missing"))];

  const tabs: [Tab, string][] = [["mine", `My inbox (${role})`], ["both", "Both"], ["VP", "VP"], ["CFO", "CFO"], ["closed", "Closed"]];
  const sel = "h-8 border border-input bg-card px-2 text-[12.5px]";

  return (
    <div>
      <PageHeader title="Review inbox" sub={`${base.mine.length} open in the ${role} inbox. Select a row to review it.`} />
      <div className="mb-3 flex items-center justify-between">
        <div className="flex border-b">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("-mb-px border-b-2 px-4 py-2 text-[12.5px]", tab === k ? "border-link font-semibold" : "border-transparent text-muted-foreground")}>
              {l} <span className="text-muted-foreground">{base[k].length}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select className={sel} value={band} onChange={(e) => setBand(e.target.value)}>{bands.map((b) => <option key={b.k} value={b.k}>{b.label}</option>)}</select>
          <select className={sel} value={sev} onChange={(e) => setSev(e.target.value as Severity | "all")}>
            <option value="all">Any severity</option>{(["critical", "high", "medium", "info"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={sel} value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="all">Any vendor</option>{vendorOpts.map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="border bg-card">
        <table className="w-full text-[12.5px]">
          <thead><tr>{["Invoice", "Vendor", "Total", "Cur.", "Age", "Inbox", "Reason", "Severity", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.number} onClick={() => open(i.number)} className={cn("cursor-pointer", sevRow[i.severity], openId === i.number && "bg-accent")}>
                <td className={`${td} font-medium`}>{i.number}</td>
                <td className={td}>{i.vendorName ?? <span className="text-destructive">Vendor missing</span>}</td>
                <td className={td}>{fmt0(i.total)}</td>
                <td className={td}>{i.currency}</td>
                <td className={td}>{ageDays(i.date)}d</td>
                <td className={td}>{i.destination.length ? i.destination.join(" + ") : `Closed by ${i.reviewedBy}`}</td>
                <td className={`${td} max-w-[360px] text-muted-foreground`}>{i.reason}</td>
                <td className={td}><SevPill sev={i.severity} /></td>
                <td className={td}>{i.status !== "review" && <StatusPill status={i.status} />}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className={`${td} py-6 text-center text-muted-foreground`}>
                {tab === "closed" ? "No cases closed in this session yet." : "No open cases match these filters."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
