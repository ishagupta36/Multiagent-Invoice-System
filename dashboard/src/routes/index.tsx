import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { ageDays, evaluate, fmt0, periods, type Invoice } from "@/lib/data";
import { SevPill, td, th, sevRow } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { ChatWidget } from "@/components/app/ChatWidget";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/")({ component: CommandCenter });

const sum = (xs: Invoice[]) => xs.reduce((s, i) => s + i.total, 0);

function CommandCenter() {
  const { invoices, role, open, period, present } = useStore();
  const [detail, setDetail] = useState<{ k: string; xs: Invoice[] } | null>(null);
  const periodLabel = periods.find((p) => p.k === period)!.label;
  const paid = invoices.filter((i) => i.status === "paid");
  const review = invoices.filter((i) => i.status === "review");
  const rejected = invoices.filter((i) => i.status === "rejected");
  const paidFlagged = paid.filter((i) => i.flags.length > 0 && !i.reviewedBy);
  const paidClean = paid.filter((i) => !paidFlagged.includes(i));
  const paidAgent = paid.filter((i) => !i.reviewedBy);
  const paidHuman = paid.filter((i) => i.reviewedBy);
  const pendVP = review.filter((i) => i.destination[0] === "VP");
  const pendCFO = review.filter((i) => i.destination[0] !== "VP");
  const parts: { k: string; xs: Invoice[]; stroke: string; bg: string }[] = role === "VP"
    ? [
        { k: "Paid, clean", xs: paidClean, stroke: "stroke-success", bg: "bg-success" },
        { k: "Paid but flagged", xs: paidFlagged, stroke: "stroke-success-soft", bg: "bg-success-soft" },
        { k: "Pending human review", xs: review, stroke: "stroke-warning", bg: "bg-warning" },
        { k: "Rejected", xs: rejected, stroke: "stroke-destructive", bg: "bg-destructive" },
      ]
    : [
        { k: "Paid via agent", xs: paidAgent, stroke: "stroke-success-soft", bg: "bg-success-soft" },
        { k: "Paid after review", xs: paidHuman, stroke: "stroke-success", bg: "bg-success" },
        { k: "Pending VP review", xs: pendVP, stroke: "stroke-warning-soft", bg: "bg-warning-soft" },
        { k: "Pending CFO review", xs: pendCFO, stroke: "stroke-warning", bg: "bg-warning" },
        { k: "Rejected", xs: rejected, stroke: "stroke-destructive", bg: "bg-destructive" },
      ];
  const mine = review.filter((i) => i.destination.includes(role));
  const n = invoices.length;
  const oldest = review.length ? Math.max(...review.map((i) => ageDays(i.date))) : 0;
  const humanClosed = invoices.filter((i) => i.reviewedBy).length;
  const autoDecided = n - review.length - humanClosed;

  const sentence = role === "CFO"
    ? `${fmt0(sum(review))} is on hold and ${fmt0(sum(rejected))} was stopped before payment.`
    : `${mine.length} case${mine.length === 1 ? "" : "s"} worth ${fmt0(sum(mine))} wait on commercial judgment.`;

  const autoPct = pct(autoDecided, n);
  const headline = review.length
    ? `Agents handled ${autoPct} of invoices automatically; ${review.length} case${review.length === 1 ? "" : "s"} (${fmt0(sum(review))}) need${review.length === 1 ? "s" : ""} a decision.`
    : `Agents handled ${autoPct} of invoices automatically; nothing is waiting on a person.`;
  const decided = invoices.filter((i) => i.status === "paid" && i.paidDate);
  const avgDays = decided.length ? Math.round(decided.reduce((a, i) => a + Math.max(0, (Date.parse(i.paidDate!) - Date.parse(i.date)) / 864e5), 0) / decided.length) : 0;
  const topDollar = [...parts].sort((a, b) => sum(b.xs) - sum(a.xs))[0];

  // control mix
  const fired = invoices.flatMap((i) => evaluate(i).filter((c) => c.fired));
  const mix = new Map<string, { name: string; n: number; sev: string }>();
  fired.forEach((c) => { const m = mix.get(c.id) ?? { name: c.name, n: 0, sev: c.severity }; m.n++; mix.set(c.id, m); });
  const mixRows = [...mix.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  const mixMax = Math.max(1, ...mixRows.map(([, m]) => m.n));

  const queue = [...review].sort((a, b) => Number(b.destination[0] === role) - Number(a.destination[0] === role) || b.total - a.total);

  return (
    <div className="space-y-3">
      {/* 1. Header band */}
      <div className="-mx-8 -mt-6 bg-ink px-8 pb-6 pt-5 text-ink-foreground">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-[30px] leading-tight">Cash Cockpit Control <span className="opacity-60">· {periodLabel}</span></h1>
          <span className="rounded-full border border-ink-foreground/30 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider opacity-80">{role} view</span>
          {review.length > 0 && (
            <a href="#needs-you" className="ml-auto rounded-full bg-warning px-3.5 py-1.5 text-[12px] font-semibold text-ink">{review.length} case{review.length === 1 ? "" : "s"} need a person · jump to list</a>
          )}
        </div>
        <p className="mt-1.5 text-[15px] font-semibold">{headline}</p>
        <p className="text-[12.5px] opacity-65">{sentence}</p>
        <div className="mt-4 grid grid-cols-4 gap-3">
          <Hero label="Processed" value={fmt0(sum(invoices))} note={`${n} invoices`} />
          <Hero label="Released to payment" value={fmt0(sum(paid))} note={`${paid.length} paid · ${pct(paid.length, n)}`} accent="bg-success" />
          <Hero label="On hold" value={fmt0(sum(review))} note={`${review.length} awaiting a person`} accent="bg-warning" />
          <Hero label="Stopped" value={fmt0(sum(rejected))} note={`${rejected.length} rejected before payment`} accent="bg-destructive" />
        </div>
      </div>

      <div className={cn("grid gap-4", present ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_320px]")}>
      <div className="min-w-0 space-y-3">
      <Step n={1} title="What happened" takeaway={`${n} invoices processed: ${pct(paid.length, n)} paid, ${pct(review.length, n)} held for human review, ${pct(rejected.length, n)} rejected.`} />
      <div className="space-y-2.5">
        {([["Paid", "Paid", "bg-success", "bg-success/[0.06] border-success/25"], ["Pending review", "Pending", "bg-warning", "bg-warning/[0.07] border-warning/30"], ["Rejected", "Rejected", "bg-destructive", "bg-destructive/[0.05] border-destructive/25"]] as const).map(([label, pre, dot, tint]) => {
          const row = parts.filter((p) => p.k.startsWith(pre));
          const all = row.flatMap((p) => p.xs);
          return (
            <div key={label} className="grid grid-cols-[150px_minmax(0,1fr)] items-stretch gap-3">
              <button type="button" onClick={() => setDetail({ k: label, xs: all })} className={cn("flex flex-col justify-center rounded-md border px-3 text-left hover:brightness-95", tint)}>
                <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-ink"><span className={cn("h-2.5 w-2.5", dot)} />{label}</span>
                <span className="text-[11.5px] text-muted-foreground">{all.length} · {fmt0(sum(all))}</span>
              </button>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${row.length + (pre === "Pending" && role === "VP" ? 1 : 0)}, minmax(0, 1fr))` }}>
                {row.map((p) => (
                  <Kpi key={p.k} tone="ink" bar={dot} tint={tint} label={short(p.k, pre)} value={p.xs.length} note={`${fmt0(sum(p.xs))} · ${pct(p.xs.length, n)}`} onClick={() => setDetail({ k: p.k, xs: p.xs })} />
                ))}
                {pre === "Pending" && role === "VP" && <Kpi tone="ink" bar={dot} tint={tint} label="Oldest open review" value={`${oldest}d`} note="From invoice date" onClick={() => setDetail({ k: "Open reviews by age", xs: [...review].sort((a, b) => ageDays(b.date) - ageDays(a.date)) })} />}
              </div>
            </div>
          );
        })}
      </div>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl rounded-xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif text-[20px]">{detail.k}</DialogTitle>
                <DialogDescription>
                  {detail.xs.length} invoice{detail.xs.length === 1 ? "" : "s"} · {fmt0(sum(detail.xs))} total · {detail.xs.filter((i) => i.flags.length).length} with flags · {periodLabel}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-auto rounded-md border">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-card"><tr>{["Severity", "Invoice", "Vendor", "Amount", "Status", "Reason", "Age"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {detail.xs.map((i) => (
                      <tr key={i.number} onClick={() => { setDetail(null); open(i.number); }} className={`cursor-pointer ${sevRow[i.severity]}`}>
                        <td className={td}><SevPill sev={i.severity} /></td>
                        <td className={`${td} font-medium`}>{i.number}</td>
                        <td className={td}>{i.vendorName ?? <span className="text-destructive">Vendor missing</span>}</td>
                        <td className={`${td} font-semibold`}>{fmt0(i.total)}</td>
                        <td className={`${td} capitalize`}>{i.status}</td>
                        <td className={`${td} text-muted-foreground`}>{i.reason}</td>
                        <td className={td}>{ageDays(i.date)}d</td>
                      </tr>
                    ))}
                    {detail.xs.length === 0 && <tr><td colSpan={7} className={`${td} py-6 text-center text-muted-foreground`}>No cases in this group.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div id="needs-you" className="scroll-mt-16"><Step n={2} title="What needs you now" takeaway={review.length ? `${review.length} open case${review.length === 1 ? "" : "s"}, ${fmt0(sum(review))} on hold. Open a row to approve, reject or route it.` : "Nothing is waiting on a person."} /></div>
      <Card
        title={`Cases under human review (${review.length})`}
        right={<Link to="/inbox" className="text-[12px] text-link">Open review inbox</Link>}
        accent
      >
        <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
          <thead><tr>{["Severity", "Invoice", "Vendor", "Amount", "Reason", "Inbox", "Age", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {queue.map((i) => (
              <tr key={i.number} onClick={() => open(i.number)} className={`cursor-pointer ${sevRow[i.severity]}`}>
                <td className={td}><SevPill sev={i.severity} /></td>
                <td className={`${td} font-medium`}>{i.number}</td>
                <td className={td}>{i.vendorName ?? <span className="text-destructive">Vendor missing</span>}</td>
                <td className={`${td} font-semibold`}>{fmt0(i.total)} {i.currency !== "USD" && <span className="font-normal text-muted-foreground">{i.currency}</span>}</td>
                <td className={`${td} text-muted-foreground`}>{i.reason}</td>
                <td className={td}>{i.destination.join(" + ")}</td>
                <td className={td}>{ageDays(i.date)}d</td>
                <td className={td}><span className="bg-link px-3 py-1 text-[11.5px] font-medium text-ink-foreground">Review</span></td>
              </tr>
            ))}
            {queue.length === 0 && <tr><td colSpan={8} className={`${td} py-6 text-center text-muted-foreground`}>All human-review cases are closed.</td></tr>}
          </tbody>
        </table></div>
      </Card>
      </div>
      {!present && <div className="pt-3"><ChatWidget /></div>}
      </div>

      <Step n={3} title="How the agents performed" takeaway={`The Approver decided ${pct(autoDecided, n)} of invoices by policy; the rest went to a person.`} />
      <div className="grid grid-cols-[2fr_1.2fr] gap-4">
        <div className="flex flex-col gap-2">
          <div className="card-elevated flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 border bg-card px-4 py-2 text-[12px]">
            {(["Paid", "Pending", "Rejected"] as const).map((pre) => {
              const row = parts.filter((p) => p.k.startsWith(pre));
              return (
                <div key={pre} className="flex items-center gap-2.5 border-l pl-4 first:border-l-0 first:pl-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink">{pre === "Pending" ? "Pending review" : pre}</span>
                  {row.length > 1 || pre !== "Rejected" ? row.map((p) => <Legend key={p.k} cls={p.bg} k={short(p.k, pre)} v="" />) : <Legend cls={row[0]?.bg ?? "bg-destructive"} k="Stopped" v="" />}
                </div>
              );
            })}
          </div>
          <div className="grid flex-1 grid-cols-2 gap-4">
            <Card title={`${autoPct} of invoices decided by agents`}>
              <div className="flex justify-center p-4">
                <Donut parts={parts.map((p) => ({ v: p.xs.length, cls: p.stroke }))} center={n} />
              </div>
            </Card>
            <Card title={topDollar && sum(topDollar.xs) > 0 ? `Most dollars: ${topDollar.k.toLowerCase()}` : "Invoice dollars by decision"}>
              <div className="flex h-[172px] items-end justify-around gap-2 px-4 pb-3 pt-6">
                {parts.map((p) => ({ k: p.k, v: Math.max(sum(p.xs), 0), cls: p.bg })).map((b, _, all) => {
                  const max = Math.max(...all.map((x) => x.v), 1);
                  return (
                    <div key={b.k} className="flex h-full flex-1 flex-col items-center justify-end" title={b.k}>
                      <div className="mb-1 text-[11.5px] font-semibold">{fmt0(b.v)}</div>
                      <div className={cn("w-full max-w-[44px]", b.cls)} style={{ height: `${Math.max(3, (b.v / max) * 100)}%` }} />
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>

        <Card title="Agent pipeline performance">
          <div className="space-y-2.5 p-4 text-[12px]">
            <Stage k="Extractor" v={n} max={n} note={`${n} of ${n} read`} cls="bg-ink" />
            <Stage k="Validator" v={n} max={n} note={`${fired.filter((c) => ["VP-01", "VP-02", "VP-03"].includes(c.id)).length} master mismatches found`} cls="bg-ink" />
            <Stage k="Approver" v={autoDecided} max={n} note={`${pct(autoDecided, n)} decided by policy`} cls="bg-ink" />
            <Stage k="Payment" v={paid.length} max={n} note={`${fmt0(sum(paid))} released`} cls="bg-success" />
            <Stage k="Human review" v={review.length + humanClosed} max={n} note={`${humanClosed} closed this session`} cls="bg-warning" />
          </div>
        </Card>
      </div>

      <div className="pt-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Value delivered</div>
      <div className="card-elevated grid grid-cols-3 divide-x border bg-card">
        <Value label="Handled automatically" value={autoPct} note="Invoices decided by policy, no person needed" />
        <Value label="Wrong payments prevented" value={fmt0(sum(rejected))} note={`${rejected.length} invoice${rejected.length === 1 ? "" : "s"} stopped before cash left`} />
        <Value label="Average time to payment" value={`${avgDays}d`} note="From invoice date to release" />
      </div>

      <Step n={4} title="What the controls caught" takeaway={mixRows[0] ? `Most frequent: ${mixRows[0][0]} ${mixRows[0][1].name} (${mixRows[0][1].n}).` : "No controls fired in this period."} />
      <Card title={`Top controls fired · ${periodLabel.toLowerCase()}`} right={<div className="flex gap-4 text-[11.5px] text-muted-foreground"><Legend cls="bg-destructive" k="Critical / high" v="" /><Legend cls="bg-warning" k="Medium" v="" /><Legend cls="bg-muted-foreground/40" k="Low / info" v="" /></div>}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 p-4">
          {mixRows.map(([id, m]) => (
            <div key={id} className="flex items-center gap-3 text-[12px]">
              <span className="w-44 shrink-0 truncate"><span className="font-medium">{id}</span> {m.name}</span>
              <div className="h-3 flex-1 bg-muted">
                <div className={cn("h-full", m.sev === "critical" || m.sev === "high" ? "bg-destructive" : m.sev === "medium" ? "bg-warning" : "bg-muted-foreground/40")} style={{ width: `${(m.n / mixMax) * 100}%` }} />
              </div>
              <span className="w-5 text-right font-medium">{m.n}</span>
            </div>
          ))}
        </div>
      </Card>

      <p className="pt-4 text-center text-[11px] text-muted-foreground">Data as of 4 Oct 2026 · Demo data</p>
    </div>
  );
}

function Step({ n, title, takeaway }: { n: number; title: string; takeaway: string }) {
  return (
    <div className="flex items-baseline gap-3 pt-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-ink-foreground">{n}</span>
      <h2 className="font-serif text-[19px] text-ink">{title}</h2>
      <p className="text-[12.5px] text-muted-foreground">{takeaway}</p>
    </div>
  );
}

const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 100) : 0}%`;

function Kpi({ label, value, note, tone, bar, onClick, tint }: { tint?: string; onClick?: () => void; bar?: string; label: string; value: React.ReactNode; note: string; tone: "ink" | "success" | "warning" | "destructive" }) {
  const t = { ink: ["border-l-ink", "text-ink"], success: ["border-l-success", "text-success"], warning: ["border-l-warning", "text-warning"], destructive: ["border-l-destructive", "text-destructive"] }[tone];
  return (
    <button type="button" onClick={onClick} className={cn("card-elevated group relative overflow-hidden border py-3.5 pl-5 pr-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg hover:ring-1 hover:ring-ink/20", tint ?? "bg-card")}>
      <span className={cn("absolute inset-y-0 left-0 w-1.5", bar ?? "bg-ink")} />
      <span className="absolute right-3 top-3 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">View cases →</span>
      <div className={cn("text-[30px] font-semibold leading-none tracking-tight", t[1])}>{value}</div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[11.5px] text-muted-foreground">{note}</div>
    </button>
  );
}

function Card({ title, children, right, accent }: { title: string; children: React.ReactNode; right?: React.ReactNode; accent?: boolean }) {
  return (
    <section className={cn("card-elevated min-w-0 overflow-hidden border bg-card", accent && "border-t-4 border-t-warning")}>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Donut({ parts, center }: { parts: { v: number; cls: string }[]; center: number }) {
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  const C = 2 * Math.PI * 40;
  let off = 0;
  return (
    <svg viewBox="-14 -14 128 128" className="h-[170px] w-[170px] -rotate-90">
      {parts.map((p, i) => {
        const len = (p.v / total) * C;
        const el = <circle key={i} cx="50" cy="50" r="40" fill="none" strokeWidth="16" className={p.cls} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />;
        const mid = ((off + len / 2) / C) * 2 * Math.PI;
        const x = 50 + 56 * Math.cos(mid), y = 50 + 56 * Math.sin(mid);
        off += len;
        return p.v > 0 ? <g key={i}>{el}<text x={x} y={y} transform={`rotate(90 ${x} ${y})`} textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[9px] font-semibold">{p.v}</text></g> : el;
      })}
      <text x="50" y="50" transform="rotate(90 50 50)" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[20px] font-semibold">{center}</text>
    </svg>
  );
}

function Legend({ cls, k, v }: { cls: string; k: string; v: string }) {
  return <div className="flex items-center gap-2"><span className={cn("inline-block h-2.5 w-2.5", cls)} /><span className="whitespace-nowrap">{k}</span><span className="whitespace-nowrap font-medium">{v}</span></div>;
}

function Stage({ k, v, max, note, cls }: { k: string; v: number; max: number; note: string; cls: string }) {
  return (
    <div>
      <div className="flex justify-between"><span className="font-medium">{k}</span><span className="text-muted-foreground">{note}</span></div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-2.5 flex-1 bg-muted"><div className={cn("h-full", cls)} style={{ width: `${(v / max) * 100}%` }} /></div>
        <span className="w-6 text-right">{v}</span>
      </div>
    </div>
  );
}

function Hero({ label, value, note, accent }: { label: string; value: string; note: string; accent?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-ink-foreground/[0.07] px-4 py-3">
      {accent && <span className={cn("absolute inset-x-0 top-0 h-1", accent)} />}
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] opacity-65">{label}</div>
      <div className="mt-1 text-[28px] font-semibold leading-none tracking-tight">{value}</div>
      <div className="mt-1 text-[11.5px] opacity-65">{note}</div>
    </div>
  );
}

function Value({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-[32px] leading-none text-ink">{value}</div>
      <div className="mt-1 text-[11.5px] text-muted-foreground">{note}</div>
    </div>
  );
}

function short(k: string, pre: string) {
  if (pre === "Rejected") return "Stopped before payment";
  const s = k.replace(/^Paid,? (but )?|^Pending /i, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
