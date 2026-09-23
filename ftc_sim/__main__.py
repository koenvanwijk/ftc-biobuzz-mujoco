"""python -m ftc_sim [teleop|auto|viewer]"""

from __future__ import annotations

import sys


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("Gebruik: python -m ftc_sim {teleop|auto|viewer} [--headless]")
        return 0
    cmd = sys.argv[1]
    rest = sys.argv[2:]
    if cmd == "teleop":
        from .teleop import main as m
    elif cmd == "auto":
        from .auto import main as m
    elif cmd == "viewer":
        from .viewer import main as m
    else:
        print(f"Onbekend commando: {cmd}")
        return 1
    return m(rest)


if __name__ == "__main__":
    raise SystemExit(main())
