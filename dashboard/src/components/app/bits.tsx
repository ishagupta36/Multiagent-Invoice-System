import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Severity, Status } from "@/lib/data";

export function StatusPill({ status }: { status: Status }) {
  const map = {
    paid: ["Paid", "text-success border-success/40 bg-success/10"],
    review: ["Human review", "text-warning border-warning/40 bg-warning/10"],
    rejected: ["Rejected", "text-destructive border-destructive/40 bg-destructive/10"],
  } as const;
  const [label, cls] = map[status];
  return <span className={cn("inline-block rounded-sm border px-1.5 py-px text-[11px] font-medium", cls)}>{label}</span>;
}

export function SevPill({ sev }: { sev: Severity }) {
  const cls = {
    critical: "text-destructive-foreground border-destructive bg-destructive",
    high: "text-destructive border-destructive/40 bg-destructive/10",
    medium: "text-warning border-warning/50 bg-warning/15",
    info: "text-muted-foreground border-border bg-muted",
  }[sev];
  return <span className={cn("inline-block rounded-sm border px-1.5 py-px text-[11px] capitalize", cls)}>{sev}</span>;
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between border-b pb-4">
      <div>
        <h1 className="font-serif text-[28px] leading-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: "success" | "warning" | "destructive" }) {
  return (
    <div className="border bg-card px-4 py-3">
      <div className="label-caps">{label}</div>
      <div className={cn("mt-1 text-[22px] font-semibold", tone === "success" && "text-success", tone === "warning" && "text-warning", tone === "destructive" && "text-destructive")}>{value}</div>
      {note && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{note}</div>}
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export const th = "px-3 py-2 text-left label-caps font-normal";
export const td = "px-3 py-2 border-t";

export const sevRow: Record<Severity, string> = {
  critical: "bg-destructive/15 hover:bg-destructive/20",
  high: "bg-destructive/8 hover:bg-destructive/15",
  medium: "bg-warning/10 hover:bg-warning/20",
  info: "hover:bg-accent",
};
