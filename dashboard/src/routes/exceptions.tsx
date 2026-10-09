import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { fmt } from "@/lib/data";
import { PageHeader, td, th } from "@/components/app/bits";

export const Route = createFileRoute("/exceptions")({ component: Exceptions });

function Exceptions() {
  const { invoices, open } = useStore();
  const rej = invoices.filter((i) => i.status === "rejected").sort((a, b) => b.total - a.total);
  const total = rej.reduce((s, i) => s + i.total, 0);
  return (
    <div>
      <PageHeader title="Exceptions" sub={`${rej.length} invoices, ${fmt(total)} stopped before payment. Read-only.`} />
      <div className="border bg-card">
        <table className="w-full text-[12.5px]">
          <thead><tr>{["Invoice", "Vendor", "Amount", "Critical reason", "Secondary finding", "Stopped by"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rej.map((i) => (
              <tr key={i.number} onClick={() => open(i.number)} className="cursor-pointer hover:bg-accent">
                <td className={`${td} font-medium`}>{i.number}</td>
                <td className={td}>{i.vendorName ?? "Vendor missing"}</td>
                <td className={td}>{fmt(i.total, i.currency)}</td>
                <td className={`${td} text-destructive`}>{i.reason}</td>
                <td className={`${td} text-muted-foreground`}>{i.flags.join(" · ") || "—"}</td>
                <td className={td}>{i.reviewedBy ?? "Policy"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
