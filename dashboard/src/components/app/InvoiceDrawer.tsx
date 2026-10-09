import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { evaluate, fmt, masterPrice, stockOf, subtotal, summedQty, ties, variance, vendors, type Role } from "@/lib/data";
import { SevPill, StatusPill, td, th } from "./bits";
import { cn } from "@/lib/utils";

type Mode = "approve" | "reject" | "send" | "keep" | null;

export function InvoiceDrawer() {
  const { all: invoices, openId, open, role, approve, reject, sendBack, keepOpen } = useStore();
  const inv = invoices.find((i) => i.number === openId);
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [showNA, setShowNA] = useState(false);

  useEffect(() => { setMode(null); setText(""); setShowNA(false); }, [openId]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && open(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  if (!inv) return null;
  const controls = evaluate(inv);
  const fired = controls.filter((c) => c.fired);
  const na = controls.filter((c) => !c.fired);
  const vendor = vendors.find((v) => v.id === inv.vendorId);
  const actionable = inv.status === "review";
  const other: Role = role === "VP" ? "CFO" : "VP";
  const priceException = controls.some((c) => c.id === "VP-04" && c.fired);
  const approveNeedsNote = role === "VP" && priceException;

  const cfg: Record<Exclude<Mode, null>, { label: string; placeholder: string; required: boolean; run: () => void }> = {
    approve: {
      label: approveNeedsNote ? "Commercial justification (required)" : "Note (optional)",
      placeholder: approveNeedsNote ? "One line: why the price exception is acceptable." : "Optional note for the audit log.",
      required: approveNeedsNote, run: () => approve(inv.number, text.trim()),
    },
    reject: {
      label: "Reason (required)",
      placeholder: inv.number === "INV-1009" ? "Return to AP. Vendor is missing and the quantity is negative." : "Why this invoice should not be paid.",
      required: true, run: () => reject(inv.number, text.trim()),
    },
    send: { label: `Note to ${other} (required)`, placeholder: `What the ${other} should decide.`, required: true, run: () => sendBack(inv.number, text.trim()) },
    keep: { label: "Note (required)", placeholder: "What is still outstanding.", required: true, run: () => keepOpen(inv.number, text.trim()) },
  };

  const lastDecision = [...inv.activity].reverse().find((a) => a.who === "VP" || a.who === "CFO" || a.who === "Approver");

  return (
    <>
      <div className="fixed inset-0 z-30 bg-ink/20" onClick={() => open(null)} />
      <aside className="fixed right-0 top-0 z-40 flex h-screen w-[680px] flex-col border-l bg-background shadow-xl">
        <div className="border-b bg-card px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-[22px] text-ink">{inv.number}</h2>
                <StatusPill status={inv.status} />
                {inv.number.includes("-R1") && <span className="text-[11px] text-muted-foreground">revision R1</span>}
              </div>
              <div className="mt-0.5 text-[13px]">{inv.vendorName ?? <span className="text-destructive">Vendor not captured</span>}</div>
            </div>
            <div className="text-right">
              <div className="text-[22px] font-semibold">{fmt(inv.total, inv.currency)}</div>
              <div className="text-[12px] text-muted-foreground">
                {inv.status === "review" ? `Destination: ${inv.destination.join(" + ")} inbox` : inv.status === "paid" ? `Paid ${inv.paidDate}` : "Payment stopped"}
              </div>
            </div>
          </div>
          <button onClick={() => open(null)} className="absolute right-3 top-2 text-[12px] text-muted-foreground hover:text-foreground">Close</button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Actions */}
          <div className="border bg-card p-4">
            {actionable ? (
              <>
                <div className="mb-2 label-caps">Actions · acting as {role}</div>
                <div className="flex flex-wrap gap-2">
                  <Btn tone="success" active={mode === "approve"} onClick={() => setMode("approve")}>Approve and release to payment</Btn>
                  <Btn tone="destructive" active={mode === "reject"} onClick={() => setMode("reject")}>Reject</Btn>
                  <Btn active={mode === "send"} onClick={() => setMode("send")}>Send to {other} inbox</Btn>
                  <Btn active={mode === "keep"} onClick={() => setMode("keep")}>Keep open</Btn>
                </div>
                {mode && (
                  <div className="mt-3">
                    <div className="mb-1 text-[12px] font-medium">{cfg[mode].label}</div>
                    <textarea
                      autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={cfg[mode].placeholder} rows={2}
                      className="w-full border border-input bg-background p-2 text-[12.5px] outline-none focus:border-link"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={cfg[mode].required && !text.trim()}
                        onClick={() => { cfg[mode].run(); setMode(null); setText(""); }}
                        className="bg-ink px-3 py-1.5 text-[12px] font-medium text-ink-foreground disabled:opacity-40"
                      >Confirm</button>
                      <button onClick={() => { setMode(null); setText(""); }} className="px-3 py-1.5 text-[12px] text-muted-foreground">Cancel</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-[12.5px]">
                <span className="label-caps">Read-only · prior decision</span>
                <p className="mt-1">{lastDecision ? `${lastDecision.who}, ${lastDecision.at}: ${lastDecision.text}` : inv.reason}</p>
                {inv.status === "rejected" && <p className="mt-1 text-destructive">{inv.reason}</p>}
              </div>
            )}
          </div>

          {/* Facts */}
          <div className="grid grid-cols-4 gap-x-4 gap-y-3 border bg-card p-4">
            <Fact k="Vendor id" v={inv.vendorId ?? "—"} />
            <Fact k="Contact" v={vendor?.contact ?? "—"} />
            <Fact k="Invoice date" v={inv.date} />
            <Fact k="Due date" v={inv.due ?? "Missing or unusable"} warn={!inv.due} />
            <Fact k="PO" v={inv.po} />
            <Fact k="Currency" v={inv.currency} warn={inv.currency !== "USD"} />
            <Fact k="Terms" v={inv.terms} />
            <Fact k="Payment note" v={inv.paymentNote} warn={/wire/i.test(inv.paymentNote)} />
          </div>

          {/* Totals */}
          <div className="grid grid-cols-5 gap-4 border bg-card p-4">
            <Fact k="Subtotal" v={fmt(subtotal(inv), inv.currency)} />
            <Fact k="Tax" v={fmt(inv.tax, inv.currency)} />
            <Fact k="Freight" v={fmt(inv.freight, inv.currency)} />
            <Fact k="Printed total" v={fmt(inv.total, inv.currency)} />
            <Fact k="Math" v={ties(inv) ? "Ties" : "Does not tie"} warn={!ties(inv)} />
          </div>

          {/* Lines */}
          <div className="border bg-card">
            <div className="border-b px-4 py-2 text-[13px] font-semibold">Lines</div>
            <table className="w-full text-[12px]">
              <thead><tr>{["Description", "SKU", "Qty", "Stock", "Inv. price", "Master", "Var.", "Line total"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {inv.lines.map((l, i) => {
                  const m = masterPrice(l.sku);
                  const st = stockOf(l.sku);
                  const v = variance(l);
                  const red = m === null || summedQty(inv, l.sku) > (st ?? 0);
                  const amber = !red && Math.abs(v ?? 0) > 5;
                  return (
                    <tr key={i} className={cn(red && "bg-destructive/10", amber && "bg-warning/10")}>
                      <td className={td}>{l.desc}</td>
                      <td className={td}>{l.sku ?? "—"}</td>
                      <td className={td}>{l.qty}</td>
                      <td className={td}>{st ?? "—"}</td>
                      <td className={td}>{fmt(l.price, inv.currency)}</td>
                      <td className={td}>{m === null ? "—" : fmt(m)}</td>
                      <td className={td}>{v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}</td>
                      <td className={cn(td, "text-right")}>{fmt(l.qty * l.price, inv.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Controls */}
          <div className="border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-[13px] font-semibold">Controls fired ({fired.length})</span>
              <button onClick={() => setShowNA(!showNA)} className="text-[12px] text-link">{showNA ? "Hide" : "Show"} {na.length} not applicable</button>
            </div>
            {fired.length === 0 && <div className="px-4 py-2 text-[12px] text-muted-foreground">No controls fired.</div>}
            {[...fired, ...(showNA ? na : [])].map((c) => (
              <div key={c.id} className={cn("flex gap-3 border-t px-4 py-2 text-[12px] first:border-t-0", !c.fired && "text-muted-foreground")}>
                <span className="w-12 shrink-0 font-medium">{c.id}</span>
                <span className="w-16 shrink-0">{c.fired ? <SevPill sev={c.severity} /> : "—"}</span>
                <span><span className="font-medium">{c.name}.</span> {c.message}</span>
              </div>
            ))}
          </div>

          {/* Commercial */}
          <div className="border bg-card p-4">
            <div className="mb-1 text-[13px] font-semibold">Commercial review</div>
            <p className="text-[12.5px] leading-relaxed">{inv.commercial}</p>
            {inv.question && <p className="mt-2 text-[12.5px]"><span className="font-medium text-warning">Unresolved:</span> {inv.question}</p>}
            {inv.flags.length > 0 && <p className="mt-2 text-[12px] text-muted-foreground">Flags: {inv.flags.join(" · ")}</p>}
          </div>

          {/* Trace */}
          <div className="border bg-card">
            <div className="border-b px-4 py-2 text-[13px] font-semibold">Agent trace</div>
            {inv.trace.map(([a, t]) => (
              <div key={a} className="flex gap-3 border-t px-4 py-1.5 text-[12px] first:border-t-0">
                <span className="w-24 shrink-0 font-medium">{a}</span><span>{t}</span>
              </div>
            ))}
          </div>

          {/* Activity */}
          <div className="border bg-card">
            <div className="border-b px-4 py-2 text-[13px] font-semibold">Activity</div>
            {[...inv.activity].reverse().map((a, i) => (
              <div key={i} className="flex gap-3 border-t px-4 py-1.5 text-[12px] first:border-t-0">
                <span className="w-28 shrink-0 text-muted-foreground">{a.at}</span>
                <span className="w-20 shrink-0 font-medium">{a.who}</span>
                <span>{a.text}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

function Fact({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div>
      <div className="label-caps">{k}</div>
      <div className={cn("mt-0.5 text-[12.5px]", warn && "text-warning font-medium")}>{v}</div>
    </div>
  );
}

function Btn({ children, onClick, active, tone }: { children: ReactNode; onClick: () => void; active: boolean; tone?: "success" | "destructive" }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border px-3 py-1.5 text-[12px] font-medium",
        tone === "success" && "border-success text-success",
        tone === "destructive" && "border-destructive text-destructive",
        active && tone === "success" && "bg-success text-ink-foreground",
        active && tone === "destructive" && "bg-destructive text-ink-foreground",
        active && !tone && "bg-ink text-ink-foreground",
      )}
    >
      {children}
    </button>
  );
}
