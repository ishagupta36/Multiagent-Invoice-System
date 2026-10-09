"""Rebuild inventory.db in the project root."""

import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent / "inventory.db"


def main() -> None:
    conn = sqlite3.connect(DB)
    try:
        conn.execute("DROP TABLE IF EXISTS inventory")
        conn.execute(
            """
            CREATE TABLE inventory (
                item_id INTEGER NOT NULL UNIQUE,
                item TEXT PRIMARY KEY,
                stock INTEGER
            )
            """
        )
        conn.execute(
            """
            INSERT INTO inventory (item_id, item, stock) VALUES
            (4303, 'WidgetA', 15),
            (1096, 'WidgetB', 10),
            (1607, 'GadgetX', 5),
            (7484, 'FakeItem', 0)
            """
        )
        conn.commit()
    finally:
        conn.close()
    print(f"Wrote {DB.name}")


if __name__ == "__main__":
    main()
