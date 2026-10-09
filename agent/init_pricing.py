"""Rebuild pricing.db in the project root."""

import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent / "pricing.db"


def main() -> None:
    conn = sqlite3.connect(DB)
    try:
        conn.execute("DROP TABLE IF EXISTS pricing")
        conn.execute(
            """
            CREATE TABLE pricing (
                item_id INTEGER PRIMARY KEY,
                unit_price REAL NOT NULL,
                last_updated_on TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            INSERT INTO pricing (item_id, unit_price, last_updated_on) VALUES
            (4303, 250, '2026-10-04'),
            (1096, 500, '2026-10-04'),
            (1607, 750, '2026-10-04')
            """
        )
        conn.commit()
    finally:
        conn.close()
    print(f"Wrote {DB.name}")


if __name__ == "__main__":
    main()
