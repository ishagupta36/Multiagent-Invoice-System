import { createFileRoute } from "@tanstack/react-router";
import { inventory, pricing, vendors, fmt } from "@/lib/data";
import { PageHeader, Section, td, th } from "@/components/app/bits";

export const Route = createFileRoute("/masters")({ component: Masters });

function Masters() {
  return (
    <div>
      <PageHeader title="Database" sub="Reference data the Validator checked each line against. Read-only." />
      <div className="grid grid-cols-[1fr_1fr] gap-5">
        <Section title="Inventory">
          <table className="w-full text-[12.5px]">
            <thead><tr>{["Item id", "Item", "Stock"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{inventory.map((i) => <tr key={i.sku}><td className={td}>{i.sku}</td><td className={td}>{i.item}</td><td className={td}>{i.stock}</td></tr>)}</tbody>
          </table>
        </Section>
        <Section title="Pricing">
          <table className="w-full text-[12.5px]">
            <thead><tr>{["Item id", "Unit price", "Last updated"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{pricing.map((p) => <tr key={p.sku}><td className={td}>{p.sku}</td><td className={td}>{p.price === null ? "No price" : fmt(p.price)}</td><td className={td}>{p.updated}</td></tr>)}</tbody>
          </table>
        </Section>
      </div>
      <div className="mt-5">
        <Section title="Vendors">
          <table className="w-full text-[12.5px]">
            <thead><tr>{["Vendor id", "Name", "Location or note", "Primary contact"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{vendors.map((v) => <tr key={v.id}><td className={td}>{v.id}</td><td className={td}>{v.name}</td><td className={`${td} text-muted-foreground`}>{v.location}</td><td className={td}>{v.contact}</td></tr>)}</tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}
