"""Arithmetic, date, and required-field checks on an extracted invoice."""

from __future__ import annotations


def basic_validation(invoice: dict) -> tuple[list[str], list[dict]]:
    pending: list[str] = []
    issues: list[dict] = []

    for field in ("vendor_name", "invoice_number", "invoice_date"):
        if not invoice.get(field):
            pending.append(field)
    if invoice.get("total") is None and invoice.get("subtotal") is None:
        pending.append("total")

    lines = invoice.get("line_items") or []
    if not lines:
        pending.append("line_items")

    for index, line in enumerate(lines, start=1):
        if not line.get("description"):
            pending.append(f"line_items[{index}].description")
        quantity = line.get("quantity")
        price = line.get("unit_price")
        if quantity is None:
            pending.append(f"line_items[{index}].quantity")
        elif quantity <= 0:
            issues.append(
                {
                    "code": "integrity",
                    "message": f"Line {index} quantity is {quantity}.",
                }
            )
        if price is None:
            pending.append(f"line_items[{index}].unit_price")
        stated = line.get("line_total")
        if quantity is not None and price is not None and stated is not None:
            expected = round(quantity * price, 2)
            if abs(stated - expected) > 0.05:
                issues.append(
                    {
                        "code": "arithmetic",
                        "message": (
                            f"Line {index} total {stated:.2f} does not equal "
                            f"{quantity:g} x {price:.2f} = {expected:.2f}."
                        ),
                    }
                )

    computed = round(sum((line.get("line_total") or 0) for line in lines), 2)
    subtotal = invoice.get("subtotal")
    if subtotal is not None and lines and abs(subtotal - computed) > 0.05:
        issues.append(
            {
                "code": "arithmetic",
                "message": f"Subtotal {subtotal:.2f} does not equal the sum of lines {computed:.2f}.",
            }
        )

    tax = invoice.get("tax") or 0
    freight = invoice.get("freight") or 0
    base = subtotal if subtotal is not None else computed
    total = invoice.get("total")
    if total is not None and lines:
        expected_total = round(base + tax + freight, 2)
        if abs(total - expected_total) > 0.05:
            issues.append(
                {
                    "code": "arithmetic",
                    "message": (
                        f"Total {total:.2f} does not equal {base:.2f} + tax {tax:.2f} "
                        f"+ freight {freight:.2f} = {expected_total:.2f}."
                    ),
                }
            )
    if total is not None and total < 0:
        issues.append(
            {
                "code": "integrity",
                "message": f"Invoice total is negative ({total:.2f}).",
            }
        )

    invoice_date = invoice.get("invoice_date")
    due_date = invoice.get("due_date")
    if invoice_date and due_date and due_date < invoice_date:
        issues.append(
            {
                "code": "date",
                "message": f"Due date {due_date} is before invoice date {invoice_date}.",
            }
        )
    elif due_date is None:
        issues.append({"code": "date", "message": "Due date is missing or not a recognized date."})

    return pending, issues
