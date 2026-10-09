"""Rebuild vendor.db in the project root."""

import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent / "vendor.db"

VENDORS = (
    (5001, "Widgets Inc.", "100 Main St, Chicago, IL 60601", None, None, "Sarah Chen"),
    (5002, "Gadgets Co.", None, None, None, "Daniel Okonkwo"),
    (5003, "Fraudster LLC", None, None, None, "Jonathan Hale"),
    (5004, "Precision Parts Ltd.", "742 Evergreen Terrace, Springfield, IL 62704", None, None, "Travis Muller"),
    (5005, "Global Supply Chain Partners", "1600 Pennsylvania Ave, Washington, DC 20500", None, None, "Michael Torres"),
    (5006, "Acme Industrial Supplies", None, None, None, "Jennifer Walsh"),
    (5007, "MegaWidgets Corp", None, None, None, "David Park"),
    (5008, "NoProd Industries", None, "billing@noproduct.biz", None, "Amanda Foster"),
    (5009, "Consolidated Materials Group", None, None, None, "Christopher Reid"),
    (5010, "Summit Manufacturing Co.", None, None, None, "Robert Klein"),
    (5011, "QuickShip Distributers", None, None, "FastShip Ltd.", "Kevin Brooks"),
    (5012, "Atlas Industrial Supply", "500 Commerce Blvd, Detroit, MI 48201", None, None, "Lisa Nguyen"),
    (5013, "TechParts International", None, None, None, "James Patterson"),
    (5014, "Reliable Components Inc.", None, None, None, "Emily Watson"),
)


def main() -> None:
    conn = sqlite3.connect(DB)
    try:
        conn.execute("DROP TABLE IF EXISTS vendor")
        conn.execute(
            """
            CREATE TABLE vendor (
                vendor_id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                address TEXT,
                email TEXT,
                former_name TEXT,
                primary_contact_name TEXT
            )
            """
        )
        conn.executemany("INSERT INTO vendor VALUES (?, ?, ?, ?, ?, ?)", VENDORS)
        conn.commit()
    finally:
        conn.close()
    print(f"Wrote {DB.name} ({len(VENDORS)} vendors)")


if __name__ == "__main__":
    main()
