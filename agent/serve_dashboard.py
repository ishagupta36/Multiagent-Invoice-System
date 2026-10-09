"""Serve the VP and CFO dashboard on localhost, port 8765."""

import argparse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "dashboard"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the VP and CFO invoice dashboard.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address. Use 0.0.0.0 to expose it on the local network.")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Dashboard at http://127.0.0.1:{args.port}", flush=True)
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        print(f"Also listening on {args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
