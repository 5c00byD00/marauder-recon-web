/** Apple iBeacon manufacturer-data layout, matching marauder::parseIBeacon in IBeacon.h (v1.21.0). */

export interface IBeacon {
  uuid: string;
  major: number;
  minor: number;
  txPower: number;
}

export function decodeIBeacon(payload: Uint8Array): IBeacon | null {
  if (payload.length < 25) return null;
  for (let offset = 0; offset + 25 <= payload.length; offset++) {
    if (
      payload[offset] !== 0x4c ||
      payload[offset + 1] !== 0x00 ||
      payload[offset + 2] !== 0x02 ||
      payload[offset + 3] !== 0x15
    ) {
      continue;
    }
    const uuid = formatUuid(payload.subarray(offset + 4, offset + 20));
    const major = (payload[offset + 20] << 8) | payload[offset + 21];
    const minor = (payload[offset + 22] << 8) | payload[offset + 23];
    const rawPower = payload[offset + 24];
    const txPower = rawPower > 127 ? rawPower - 256 : rawPower;
    return { uuid, major, minor, txPower };
  }
  return null;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toUpperCase();
}
