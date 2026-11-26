#!/usr/bin/env python3
"""Write the PWA icons. Stdlib only."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

BG = (18, 22, 20, 255)
AMBER = (224, 179, 106, 255)
GREEN = (143, 191, 168, 255)


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def png(size: int) -> bytes:
    raw = bytearray()
    center = (size - 1) / 2
    radius = size * 0.22
    arm = size * 0.018
    reach = size * 0.16
    for y in range(size):
        raw.append(0)
        for x in range(size):
            dx = x - center
            dy = y - center
            distance = (dx * dx + dy * dy) ** 0.5
            on_ring = abs(distance - radius) <= size * 0.012
            on_cross = (abs(dx) <= arm and abs(dy) <= reach) or (abs(dy) <= arm and abs(dx) <= reach)
            color = AMBER if on_cross else GREEN if on_ring else BG
            raw.extend(color)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


def main() -> None:
    directory = Path(__file__).resolve().parents[1] / "public" / "icons"
    directory.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        (directory / f"icon-{size}.png").write_bytes(png(size))


if __name__ == "__main__":
    main()
