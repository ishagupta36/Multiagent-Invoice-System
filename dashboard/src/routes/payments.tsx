import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { fmt } from "@/lib/data";
import { PageHeader, Tile, td, th } from "@/components/app/bits";

export const Route = createFileRoute("/payments")({ component: Payments });

function Payments() {
  const { invoices, open } = useStore();
  const paid = invoices.filter((i) => i.status === "paid").sort((a, b) => (b.paidDate ?? "").localeCompare(a.paidDate ?? ""));
  const total = paid.reduce((s, i) => s + i.total, 0);
  const largest = paid.reduce((m, i) => (i.total > m.total ? i : m), paid[0]!);
  return (
    <div className="space-y-5">
      <PageHeader title="Payments" sub="Mock payments released by policy or by a reviewer. No money moves from this console." />
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Paid count" value={paid.length} />
        <Tile label="Paid dollars" value={fmt(total)} tone="success" />
        <Tile label="Largest single payment" value={largest ? fmt(largest.total, largest.currency) : "—"} note={largest ? `${largest.number} · ${largest.vendorName ?? "Vendor missing"}` : ""} />
      </div>
      <div className="border bg-card">
        <table className="w-full text-[12.5px]">
          <thead><tr>{["Date paid", "Vendor", "Amount", "Invoice", "Acknowledged flag", "Released by"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {paid.map((i) => (
              <tr key={i.number} onClick={() => open(i.number)} className="cursor-pointer hover:bg-accent">
                <td className={td}>{i.paidDate}</td>
                <td className={td}>{i.vendorName ?? "Vendor missing"}</td>
                <td className={`${td} font-medium`}>{fmt(i.total, i.currency)}</td>
                <td className={td}>{i.number}</td>
                <td className={`${td} text-muted-foreground`}>{i.flags.join(" · ") || "—"}</td>
                <td className={td}>{i.reviewedBy ? `${i.reviewedBy} (human review)` : "Policy"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
