import { useState } from "react";
import { useStore } from "@/lib/store";
import { ageDays, fmt0 } from "@/lib/data";
import { cn } from "@/lib/utils";

type Msg = { who: "me" | "bot"; text: string };
const suggestions = ["What needs me?", "How much is on hold?", "Oldest open case?", "What was rejected?", "How much was paid?"];

export function ChatWidget() {
  const { invoices, role } = useStore();
  const [q, setQ] = useState("");
  const [min, setMin] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);

  const answer = (s: string): string => {
    const t = s.toLowerCase();
    const review = invoices.filter((i) => i.status === "review");
    const mine = review.filter((i) => i.destination.includes(role));
    const sum = (xs: typeof invoices) => fmt0(xs.reduce((a, i) => a + i.total, 0));
    if (/(need|mine|my|inbox|waiting)/.test(t))
      return mine.length ? `${mine.length} case(s) worth ${sum(mine)} wait on you: ${mine.slice(0, 5).map((i) => i.number).join(", ")}.` : "Nothing is waiting on you right now.";
    if (/(hold|review|open)/.test(t) && !/oldest/.test(t)) return `${review.length} case(s) are under review, ${sum(review)} on hold.`;
    if (/(oldest|age|longest)/.test(t)) {
      if (!review.length) return "There are no open cases.";
      const o = [...review].sort((a, b) => ageDays(b.date) - ageDays(a.date))[0]!;
      return `Oldest open case is ${o.number} (${o.vendorName ?? "vendor missing"}), ${ageDays(o.date)} days old, ${fmt0(o.total)}.`;
    }
    if (/reject/.test(t)) { const r = invoices.filter((i) => i.status === "rejected"); return r.length ? `${r.length} rejected, ${sum(r)} stopped: ${r.slice(0, 5).map((i) => i.number).join(", ")}.` : "Nothing was rejected in this period."; }
    if (/paid|payment/.test(t)) { const p = invoices.filter((i) => i.status === "paid"); return `${p.length} invoice(s) paid, ${sum(p)} released.`; }
    const hit = invoices.find((i) => t.includes(i.number.toLowerCase()));
    if (hit) return `${hit.number}: ${hit.vendorName ?? "vendor missing"}, ${fmt0(hit.total)}, status ${hit.status}${hit.reason ? ` — ${hit.reason}` : ""}.`;
    return "This demo assistant can answer: what needs you, amount on hold, oldest case, rejections, payments, or an invoice number.";
  };

  const send = (s: string) => {
    if (!s.trim()) return;
    setMsgs((m) => [...m, { who: "me", text: s }, { who: "bot", text: answer(s) }]);
    setQ("");
  };

  return (
    <div className={cn("sticky top-16 flex flex-col overflow-hidden rounded-2xl border border-ink/15 bg-card shadow-[0_12px_32px_-10px_color-mix(in_oklch,var(--ink)_40%,transparent)]", min ? "h-auto" : "h-[560px]")}>
      <div className="flex items-center justify-between bg-ink px-4 py-2.5 text-ink-foreground">
        <span className="flex items-center gap-2 text-[13px] font-semibold"><span className="h-2 w-2 rounded-full bg-success-soft" />Ask Cash Cockpit · {role}</span>
        <button onClick={() => setMin((m) => !m)} aria-label={min ? "Expand chat" : "Minimize chat"} className="flex h-6 w-6 items-center justify-center rounded-full text-[15px] leading-none opacity-80 hover:bg-ink-foreground/15 hover:opacity-100">{min ? "+" : "–"}</button>
      </div>
      {!min && (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto bg-background/60 p-3 text-[12.5px]">
            {msgs.length === 0 && <p className="rounded-xl bg-muted px-3 py-2 text-muted-foreground">Hi! I'm a demo assistant with scripted answers from the current timeline. Try a question below.</p>}
            {msgs.map((m, i) => (
              <div key={i} className={cn("max-w-[85%] px-3 py-2 shadow-sm", m.who === "me" ? "ml-auto rounded-2xl rounded-br-sm bg-ink text-ink-foreground" : "rounded-2xl rounded-bl-sm border bg-card")}>{m.text}</div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t px-3 py-2">
            {suggestions.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-link hover:text-link">{s}</button>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex gap-2 px-3 pb-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question" className="flex-1 rounded-full border border-input bg-background px-3.5 py-2 text-[12.5px] outline-none focus:border-link" />
            <button className="rounded-full bg-link px-4 text-[12px] font-medium text-ink-foreground">Send</button>
          </form>
        </>
      )}
    </div>
  );
}
