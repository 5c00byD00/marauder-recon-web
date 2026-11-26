import orgs from "../../data/oui-orgs.json";
import rawMap from "../../data/oui-map.txt?raw";

let table: Map<string, string> | null = null;

export function lookupOui(prefix: string): string | null {
  return ouiTable().get(prefix.toUpperCase()) ?? null;
}

export function macPrefix(mac: string): string {
  return mac.split(":").slice(0, 3).join("").toUpperCase();
}

export function isLocallyAdministered(mac: string): boolean {
  return (firstOctet(mac) & 0x02) !== 0;
}

export function isGroupAddress(mac: string): boolean {
  return (firstOctet(mac) & 0x01) !== 0;
}

/** Universal OUI only. Locally administered and group addresses are not registry assignments. */
export function vendorForMac(mac: string): string | null {
  if (isLocallyAdministered(mac) || isGroupAddress(mac)) return null;
  return lookupOui(macPrefix(mac));
}

export function formatPrefix(prefix: string): string {
  const hex = prefix.replace(/:/g, "").toUpperCase();
  return `${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}`;
}

function firstOctet(mac: string): number {
  return Number.parseInt(mac.slice(0, 2), 16);
}

function ouiTable(): Map<string, string> {
  if (table) return table;
  const compact = rawMap.replace(/\s+/g, "");
  const map = new Map<string, string>();
  const names = orgs as string[];
  for (let offset = 0; offset + 10 <= compact.length; offset += 10) {
    const prefix = compact.slice(offset, offset + 6);
    const index = Number.parseInt(compact.slice(offset + 6, offset + 10), 16);
    const name = names[index];
    if (name) map.set(prefix, name);
  }
  table = map;
  return map;
}
