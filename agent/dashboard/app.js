const invoices = structuredClone(window.SEED);
const state = {
  role: "vp",
  page: "command",
  query: "",
  inboxTab: "mine",
  band: "all",
  openId: null,
  formError: "",
};

const PAGES = [
  ["command", "Command center"],
  ["inbox", "Review inbox"],
  ["payments", "Payments"],
  ["exceptions", "Exceptions"],
  ["masters", "Masters"],
];

const nav = document.getElementById("nav");
const content = document.getElementById("content");
const title = document.getElementById("page-title");
const drawerRoot = document.getElementById("drawer-root");
const search = document.getElementById("search");

document.getElementById("role-vp").onclick = () => setRole("vp");
document.getElementById("role-cfo").onclick = () => setRole("cfo");
search.oninput = () => {
  state.query = search.value.trim().toLowerCase();
  const found = invoices.filter(matchesQuery);
  if (state.query && found.length === 1) {
    state.openId = found[0].id;
    state.formError = "";
  }
  render();
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.openId) {
    state.openId = null;
    state.formError = "";
    render();
  }
});

function setRole(role) {
  state.role = role;
  document.getElementById("role-vp").classList.toggle("active", role === "vp");
  document.getElementById("role-cfo").classList.toggle("active", role === "cfo");
  render();
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function money(amount, currency) {
  const formatted = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = amount < 0 ? "-" : "";
  return currency === "EUR" ? `${sign}€${formatted}` : `${sign}$${formatted}`;
}

function usd(list, predicate) {
  return list.filter((invoice) => invoice.currency === "USD" && predicate(invoice)).reduce((sum, invoice) => sum + invoice.total, 0);
}

function ageDays(iso) {
  if (!iso) return "";
  const asOf = new Date(`${window.AS_OF}T00:00:00`);
  const date = new Date(`${iso}T00:00:00`);
  return Math.round((asOf - date) / 86400000);
}

function displayNumber(invoice) {
  return invoice.revision ? `${invoice.number} ${invoice.revision}` : invoice.number;
}

function matchesQuery(invoice) {
  if (!state.query) return true;
  const haystack = `${invoice.number} ${invoice.revision || ""} ${invoice.vendor}`.toLowerCase();
  return haystack.includes(state.query);
}

function inBand(invoice) {
  const total = Math.abs(invoice.total);
  if (state.band === "under5") return total < 5000;
  if (state.band === "5to10") return total >= 5000 && total <= 10000;
  if (state.band === "10to25") return total > 10000 && total <= 25000;
  if (state.band === "over25") return total > 25000;
  return true;
}

function openReviews() {
  return invoices.filter((invoice) => invoice.status === "review");
}

function inInbox(invoice, box) {
  return invoice.status === "review" && invoice.inboxes.includes(box);
}

function mine(invoice) {
  return inInbox(invoice, state.role);
}

function queue() {
  return invoices.filter((invoice) => {
    if (!matchesQuery(invoice) || !inBand(invoice)) return false;
    if (state.inboxTab === "mine") return mine(invoice);
    if (state.inboxTab === "both") return invoice.status === "review" && invoice.inboxes.includes("vp") && invoice.inboxes.includes("cfo");
    if (state.inboxTab === "vp") return inInbox(invoice, "vp");
    if (state.inboxTab === "cfo") return inInbox(invoice, "cfo");
    return invoice.status !== "review";
  }).sort((a, b) => b.total - a.total);
}

function statusLabel(status) {
  if (status === "paid") return "Paid";
  if (status === "review") return "Human review";
  return "Rejected";
}

function inboxLabel(invoice) {
  if (invoice.status !== "review") return "Closed";
  const names = invoice.inboxes.map((box) => (box === "vp" ? "VP inbox" : "CFO inbox"));
  return names.join(" and ") || "Unassigned";
}

function pill(status) {
  return `<span class="pill ${esc(status)}">${esc(statusLabel(status))}</span>`;
}

function skuTotals(invoice) {
  const totals = {};
  invoice.lines.forEach((item) => {
    if (!item.sku) return;
    totals[item.sku] = totals[item.sku] || { qty: 0, stock: item.stock };
    totals[item.sku].qty += item.qty;
  });
  return totals;
}

function lineClass(invoice, item) {
  if (!item.sku || item.stock == null || item.qty <= 0) return "bad";
  const summed = skuTotals(invoice)[item.sku];
  if (summed && summed.stock != null && summed.qty > summed.stock) return "bad";
  if (item.master != null && Math.abs(item.price - item.master) / item.master > 0.05) return "warn";
  return "";
}

function varianceText(item) {
  if (item.master == null) return "No master";
  const pct = ((item.price - item.master) / item.master) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function stamp() {
  return new Date().toISOString();
}

function findInvoice(id) {
  return invoices.find((invoice) => invoice.id === id);
}

function render() {
  title.textContent = PAGES.find((page) => page[0] === state.page)[1];
  const reviewCount = openReviews().length;
  nav.innerHTML = PAGES.map(([id, label]) => {
    const badge = id === "inbox" ? `<span class="badge">${reviewCount}</span>` : "";
    return `<button type="button" data-page="${id}" class="${state.page === id ? "active" : ""}">${esc(label)}${badge}</button>`;
  }).join("");
  nav.querySelectorAll("button").forEach((button) => {
    button.onclick = () => {
      state.page = button.dataset.page;
      render();
    };
  });
  const views = { command: renderCommand, inbox: renderInbox, payments: renderPayments, exceptions: renderExceptions, masters: renderMasters };
  content.innerHTML = views[state.page]();
  bindRows();
  bindInboxControls();
  renderDrawer();
}

function bindRows() {
  content.querySelectorAll("[data-open]").forEach((row) => {
    row.onclick = () => {
      state.openId = row.dataset.open;
      state.formError = "";
      render();
    };
  });
}

function bindInboxControls() {
  content.querySelectorAll("[data-tab]").forEach((button) => {
    button.onclick = () => {
      state.inboxTab = button.dataset.tab;
      render();
    };
  });
  const band = content.querySelector("#band");
  if (band) {
    band.onchange = () => {
      state.band = band.value;
      render();
    };
  }
}

function renderCommand() {
  const paid = usd(invoices, (invoice) => invoice.status === "paid");
  const held = usd(invoices, (invoice) => invoice.status === "review");
  const stopped = usd(invoices, (invoice) => invoice.status === "rejected");
  const eurHeld = invoices.filter((invoice) => invoice.status === "review" && invoice.currency === "EUR").reduce((sum, invoice) => sum + invoice.total, 0);
  const mineCount = invoices.filter(mine).length;
  const oldest = openReviews().reduce((max, invoice) => Math.max(max, ageDays(invoice.invoiceDate) || 0), 0);
  const over10 = invoices.filter((invoice) => invoice.currency === "USD" && invoice.total > 10000).length;
  const lede = state.role === "cfo"
    ? `${money(held, "USD")} is on hold and ${money(stopped, "USD")} was stopped before payment.`
    : `${mineCount} open ${mineCount === 1 ? "case is" : "cases are"} in the VP inbox, waiting on a commercial judgment.`;
  const eurNote = eurHeld ? ` Plus ${money(eurHeld, "EUR")} held in euros.` : "";
  const maxBar = Math.max(paid, held, stopped, 1);
  const needs = openReviews().filter(matchesQuery).sort((a, b) => b.total - a.total);
  return `
    <p class="lede">${esc(lede)}${esc(eurNote)}</p>
    <div class="metrics">
      <div class="metric"><b>${esc(money(state.role === "cfo" ? paid : held, "USD"))}</b><span>${state.role === "cfo" ? "Paid, USD" : "USD on hold"}</span></div>
      <div class="metric"><b>${mineCount}</b><span>In your inbox</span></div>
      <div class="metric"><b>${state.role === "cfo" ? over10 : oldest}</b><span>${state.role === "cfo" ? "Invoices over $10,000" : "Oldest open review, days"}</span></div>
      <div class="metric"><b>${esc(money(stopped, "USD"))}</b><span>Payment stopped</span></div>
    </div>
    <div class="split">
      <div class="panel">
        <h2>Needs a person</h2>
        ${invoiceTable(needs, true)}
      </div>
      <div class="panel">
        <h2>Invoice dollars by decision, January 2026 cohort</h2>
        <div class="bars">
          ${bar("Paid", paid, maxBar, "paid")}
          ${bar("In review", held, maxBar, "review")}
          ${bar("Rejected", stopped, maxBar, "rejected")}
        </div>
        <p class="small">USD only. The euro hold is excluded from these bars.</p>
      </div>
    </div>`;
}

function bar(label, amount, max, kind) {
  const width = Math.max(2, Math.round((Math.abs(amount) / max) * 100));
  return `<div class="bar-row"><span>${esc(label)}</span><div class="track"><div class="fill ${kind}" style="width:${width}%"></div></div><span class="num">${esc(money(amount, "USD"))}</span></div>`;
}

function invoiceTable(rows, compact) {
  if (!rows.length) return `<p class="small">No invoices in this view.</p>`;
  const head = compact
    ? "<tr><th>Invoice</th><th>Vendor</th><th>Total</th><th>Inbox</th></tr>"
    : "<tr><th>Invoice</th><th>Vendor</th><th>Total</th><th>Age</th><th>Inbox</th><th>Why it is here</th></tr>";
  const body = rows.map((invoice) => {
    const cells = compact
      ? `<td>${esc(displayNumber(invoice))}</td><td>${esc(invoice.vendor || "Unknown vendor")}</td><td class="num">${esc(money(invoice.total, invoice.currency))}</td><td>${esc(inboxLabel(invoice))}</td>`
      : `<td>${esc(displayNumber(invoice))} ${pill(invoice.status)}</td><td>${esc(invoice.vendor || "Unknown vendor")}</td><td class="num">${esc(money(invoice.total, invoice.currency))}</td><td class="num">${ageDays(invoice.invoiceDate)}</td><td>${esc(inboxLabel(invoice))}</td><td>${esc(invoice.reason)}</td>`;
    return `<tr class="clickable" data-open="${esc(invoice.id)}">${cells}</tr>`;
  }).join("");
  return `<table>${head}${body}</table>`;
}

function renderInbox() {
  const tabs = [
    ["mine", "My inbox"],
    ["both", "Both"],
    ["vp", "VP"],
    ["cfo", "CFO"],
    ["closed", "Closed"],
  ];
  const rows = queue();
  return `
    <div class="tools">
      <div class="tabs">${tabs.map(([id, label]) => `<button type="button" data-tab="${id}" class="${state.inboxTab === id ? "active" : ""}">${esc(label)}</button>`).join("")}</div>
      <select class="band" id="band" aria-label="Amount band">
        ${["all", "under5", "5to10", "10to25", "over25"].map((id) => {
          const labels = { all: "All amounts", under5: "Under $5,000", "5to10": "$5,000 to $10,000", "10to25": "$10,000 to $25,000", over25: "Over $25,000" };
          return `<option value="${id}" ${state.band === id ? "selected" : ""}>${labels[id]}</option>`;
        }).join("")}
      </select>
    </div>
    ${invoiceTable(rows, false)}`;
}

function renderPayments() {
  const paid = invoices.filter((invoice) => invoice.status === "paid" && matchesQuery(invoice));
  const total = usd(paid, () => true);
  const largest = paid.filter((invoice) => invoice.currency === "USD").reduce((max, invoice) => Math.max(max, invoice.total), 0);
  return `
    <div class="metrics">
      <div class="metric"><b>${paid.length}</b><span>Paid invoices</span></div>
      <div class="metric"><b>${esc(money(total, "USD"))}</b><span>Paid, USD</span></div>
      <div class="metric"><b>${esc(money(largest, "USD"))}</b><span>Largest USD payment</span></div>
    </div>
    <table>
      <tr><th>Invoice</th><th>Vendor</th><th>Invoice date</th><th>Amount</th><th>Flag acknowledged</th></tr>
      ${paid.map((invoice) => `<tr class="clickable" data-open="${esc(invoice.id)}"><td>${esc(displayNumber(invoice))}</td><td>${esc(invoice.vendor)}</td><td>${esc(invoice.invoiceDate)}</td><td class="num">${esc(money(invoice.total, invoice.currency))}</td><td>${esc(invoice.flag || "None")}</td></tr>`).join("")}
    </table>`;
}

function renderExceptions() {
  const rows = invoices.filter((invoice) => invoice.status === "rejected" && matchesQuery(invoice));
  return `
    <p class="lede">These invoices were stopped before payment.</p>
    <table>
      <tr><th>Invoice</th><th>Vendor</th><th>Total</th><th>Critical reason</th></tr>
      ${rows.map((invoice) => `<tr class="clickable" data-open="${esc(invoice.id)}"><td>${esc(displayNumber(invoice))}</td><td>${esc(invoice.vendor)}</td><td class="num">${esc(money(invoice.total, invoice.currency))}</td><td>${esc(invoice.reason)}</td></tr>`).join("")}
    </table>`;
}

function renderMasters() {
  const inventory = window.MASTERS.inventory.map((row) => `<tr><td>${row.itemId}</td><td>${esc(row.item)}</td><td class="num">${row.stock}</td></tr>`).join("");
  const pricing = window.MASTERS.pricing.map((row) => `<tr><td>${row.itemId}</td><td>${esc(row.item)}</td><td class="num">${esc(money(row.unitPrice, "USD"))}</td><td>${esc(row.updated)}</td></tr>`).join("");
  const vendors = window.MASTERS.vendors.map((row) => `<tr><td>${row.vendorId}</td><td>${esc(row.name)}</td><td>${esc(row.address || "—")}</td><td>${esc(row.contact)}</td></tr>`).join("");
  return `
    <div class="panel"><h2>Inventory</h2><table><tr><th>Item id</th><th>Item</th><th>Stock</th></tr>${inventory}</table></div>
    <div class="panel"><h2>Pricing</h2><table><tr><th>Item id</th><th>Item</th><th>Unit price</th><th>Last updated</th></tr>${pricing}</table></div>
    <div class="panel"><h2>Vendors</h2><table><tr><th>Vendor id</th><th>Name</th><th>Address</th><th>Primary contact</th></tr>${vendors}</table></div>`;
}

function renderDrawer() {
  const invoice = findInvoice(state.openId);
  if (!invoice) {
    drawerRoot.innerHTML = "";
    return;
  }
  const open = invoice.status === "review";
  const other = state.role === "vp" ? "CFO" : "VP";
  const notePlaceholder = invoice.id === "INV-1009"
    ? "Return to AP. Vendor is missing and the quantity is negative."
    : invoice.id === "INV-1010"
      ? "One-line commercial justification for the rush premium"
      : "Note for the file";
  drawerRoot.innerHTML = `
    <div class="backdrop" id="backdrop"></div>
    <aside class="drawer" role="dialog" aria-label="${esc(displayNumber(invoice))}">
      <header>
        <div>
          <h2>${esc(displayNumber(invoice))}</h2>
          <p class="muted">${esc(invoice.vendor || "Unknown vendor")} · ${esc(money(invoice.total, invoice.currency))}</p>
          <p>${pill(invoice.status)} <span class="small">${esc(inboxLabel(invoice))}</span></p>
        </div>
        <button type="button" class="icon-btn" id="close-drawer">Close</button>
      </header>
      <p class="reason">${esc(invoice.reason)}</p>
      <div class="facts">
        ${fact("Vendor id", invoice.vendorId || "Not matched")}
        ${fact("Contact", invoice.contact || "—")}
        ${fact("Invoice date", invoice.invoiceDate)}
        ${fact("Due date", invoice.dueDate || "Missing")}
        ${fact("PO", invoice.po || "—")}
        ${fact("Terms", invoice.terms || "—")}
        ${fact("Currency", invoice.currency)}
        ${fact("Math", invoice.mathTies ? "Ties" : "Does not tie")}
      </div>
      ${invoice.bank ? `<p class="small">Payment note: ${esc(invoice.bank)}</p>` : ""}
      <div class="facts">
        ${fact("Subtotal", money(invoice.subtotal, invoice.currency))}
        ${fact("Tax", money(invoice.tax, invoice.currency))}
        ${fact("Freight", money(invoice.freight, invoice.currency))}
        ${fact("Total", money(invoice.total, invoice.currency))}
      </div>
      <table class="lines">
        <tr><th>Item</th><th>Qty</th><th>Stock</th><th>Price</th><th>Master</th><th>Variance</th></tr>
        ${invoice.lines.map((item) => {
          const klass = lineClass(invoice, item);
          return `<tr>
            <td class="${klass}">${esc(item.description)}<div class="small">${esc(item.sku || "No SKU")}</div></td>
            <td class="num ${klass}">${item.qty}</td>
            <td class="num ${klass}">${item.stock == null ? "—" : item.stock}</td>
            <td class="num ${klass}">${esc(money(item.price, invoice.currency))}</td>
            <td class="num ${klass}">${item.master == null ? "—" : esc(money(item.master, "USD"))}</td>
            <td class="${klass}">${esc(varianceText(item))}</td>
          </tr>`;
        }).join("")}
      </table>
      <div>
        <h2 class="section-label">Controls</h2>
        ${invoice.controls.length ? invoice.controls.map((control) => `<p><span class="pill ${esc(control.severity)}">R${control.id} ${esc(control.severity)}</span> ${esc(control.rule)}. ${esc(control.message)}</p>`).join("") : `<p class="small">No control exceptions.</p>`}
      </div>
      <div>
        <h2 class="section-label">Commercial review</h2>
        <p>${esc(invoice.commercial)}</p>
        ${invoice.unresolved.map((question) => `<p class="small">Open question: ${esc(question)}</p>`).join("")}
      </div>
      <div>
        <h2 class="section-label">Agent trace</h2>
        <ol class="trace">${invoice.trace.map((entry) => `<li><strong>${esc(entry[0])}</strong> ${esc(entry[1])}</li>`).join("")}</ol>
      </div>
      ${open ? `<form class="actions" id="review-form">
        <textarea id="review-note" placeholder="${esc(notePlaceholder)}"></textarea>
        ${state.formError ? `<p class="form-error">${esc(state.formError)}</p>` : ""}
        <div class="action-row">
          <button type="button" class="primary" data-action="approve">Approve and release</button>
          <button type="button" class="danger" data-action="reject">Reject</button>
          <button type="button" data-action="send">Send to ${other} inbox</button>
          <button type="button" data-action="keep">Keep open</button>
        </div>
      </form>` : `<p class="small">This invoice is closed. The decision stands.</p>`}
      <div>
        <h2 class="section-label">Activity</h2>
        <div class="activity">${invoice.activity.slice().reverse().map((entry) => `<p><strong>${esc(entry.actor)}</strong> <span class="small">${esc(entry.at.slice(0, 16).replace("T", " "))}</span><br>${esc(entry.text)}</p>`).join("")}</div>
      </div>
    </aside>`;
  document.getElementById("backdrop").onclick = closeDrawer;
  document.getElementById("close-drawer").onclick = closeDrawer;
  drawerRoot.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => act(invoice, button.dataset.action);
  });
}

function fact(label, value) {
  return `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function closeDrawer() {
  state.openId = null;
  state.formError = "";
  render();
}

function act(invoice, action) {
  const note = document.getElementById("review-note").value.trim();
  const actor = state.role === "vp" ? "VP" : "CFO";
  if (action === "reject" && !note) {
    state.formError = "A rejection reason is required.";
    render();
    return;
  }
  if (action === "send" && !note) {
    state.formError = "A note is required to move the inbox.";
    render();
    return;
  }
  if (action === "approve" && invoice.id === "INV-1010" && !note) {
    state.formError = "Add a one-line commercial justification for the rush premium.";
    render();
    return;
  }
  if (action === "keep" && !note) {
    state.formError = "Add a note before keeping the case open.";
    render();
    return;
  }
  state.formError = "";
  if (action === "approve") {
    invoice.status = "paid";
    invoice.inboxes = [];
    invoice.flag = invoice.flag || (invoice.total > 5000 ? "Total is above $5,000." : "");
    invoice.trace.push(["Payment", `Paid ${invoice.total.toFixed(2)} to ${invoice.vendor || "unknown vendor"}.`]);
    invoice.activity.push({ at: stamp(), actor, text: note ? `Approved and released. ${note}` : "Approved and released to payment." });
  } else if (action === "reject") {
    invoice.status = "rejected";
    invoice.inboxes = [];
    invoice.reason = note;
    invoice.trace.push(["Payment", "Not paid."]);
    invoice.activity.push({ at: stamp(), actor, text: `Rejected. ${note}` });
  } else if (action === "send") {
    invoice.inboxes = [state.role === "vp" ? "cfo" : "vp"];
    invoice.activity.push({ at: stamp(), actor, text: `${actor} sent this to the ${state.role === "vp" ? "CFO" : "VP"} inbox. ${note}` });
  } else {
    invoice.activity.push({ at: stamp(), actor, text: note });
  }
  render();
}

render();
