#!/usr/bin/env python3
"""Rebuild the bundled IEEE MA-L snapshot.

Download https://standards-oui.ieee.org/oui/oui.csv and run:

    python3 scripts/build-oui.py /path/to/oui.csv

The committed files are a snapshot used offline by the app. Registry facts
are not code from ESP32 Marauder.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: build-oui.py oui.csv", file=sys.stderr)
        return 2
    rows: list[tuple[str, str]] = []
    with open(sys.argv[1], newline="", encoding="utf-8", errors="replace") as handle:
        reader = csv.reader(handle)
        next(reader)
        for record in reader:
            if len(record) < 3:
                continue
            assignment = record[1].strip().upper().replace(":", "").replace("-", "")
            if len(assignment) != 6 or any(char not in "0123456789ABCDEF" for char in assignment):
                continue
            rows.append((assignment, record[2].strip()))
    orgs: list[str] = []
    index: dict[str, int] = {}
    parts: list[str] = []
    for assignment, org in rows:
        if org not in index:
            index[org] = len(orgs)
            orgs.append(org)
        parts.append(f"{assignment}{index[org]:04X}")
    blob = "".join(parts)
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "oui-orgs.json").write_text(json.dumps(orgs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    lines = [blob[offset : offset + 200] for offset in range(0, len(blob), 200)]
    (DATA / "oui-map.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(rows)} assignments, {len(orgs)} organizations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
