import type { Mission, Observation, RadioContext } from "../recon/types";
import { contextIbeacon, flagsForDevice, flagsForNetwork, orderFlags, type Flag } from "./identify";
import { isGroupAddress, vendorForMac } from "./oui";
import type { IBeacon } from "../recon/ibeacon";

export interface DeviceReport {
  mac: string;
  vendor: string | null;
  randomized: boolean;
  group: boolean;
  roles: string[];
  channels: number[];
  sightings: number;
  firstMs: number;
  lastMs: number;
  rssiMin: number;
  rssiMax: number;
  rssiLast: number;
  latitude: number | null;
  longitude: number | null;
  probeSsids: string[];
  deauthCount: number;
  ibeacon: IBeacon | null;
  flags: Flag[];
}

export interface NetworkReport {
  ssid: string;
  probes: number;
  probers: string[];
  flags: Flag[];
}

export interface Analysis {
  devices: DeviceReport[];
  networks: NetworkReport[];
}

const ROLE_BY_TYPE: Record<string, string> = {
  "access-point": "access-point",
  station: "station",
  ble: "ble",
  ibeacon: "ibeacon",
};

export function analyze(mission: Mission): Analysis {
  const contexts = new Map<string, RadioContext>();
  for (const context of mission.contexts) contexts.set(context.mac.toUpperCase(), context);

  const buckets = new Map<string, Observation[]>();
  for (const observation of mission.observations) {
    const mac = observation.mac.toUpperCase();
    const list = buckets.get(mac) ?? [];
    list.push(observation);
    buckets.set(mac, list);
  }
  for (const relationship of mission.relationships) {
    if (isMac(relationship.source) && !buckets.has(relationship.source)) buckets.set(relationship.source, []);
    if (isMac(relationship.target) && !buckets.has(relationship.target)) buckets.set(relationship.target, []);
  }

  const devices = [...buckets.entries()].map(([mac, rows]) => buildDevice(mac, rows, contexts.get(mac))).sort((left, right) => left.mac.localeCompare(right.mac));

  const networks = new Map<string, { probes: number; probers: Set<string> }>();
  for (const observation of mission.observations) {
    if (observation.event !== "probe" || !observation.ssid) continue;
    const entry = networks.get(observation.ssid) ?? { probes: 0, probers: new Set<string>() };
    entry.probes += 1;
    entry.probers.add(observation.mac);
    networks.set(observation.ssid, entry);
  }
  for (const context of mission.contexts) {
    for (const ssid of context.announcedSsids) {
      if (!networks.has(ssid)) networks.set(ssid, { probes: 0, probers: new Set<string>() });
    }
  }

  return {
    devices,
    networks: [...networks.entries()]
      .map(([ssid, entry]) => ({
        ssid,
        probes: entry.probes,
        probers: [...entry.probers].sort(),
        flags: flagsForNetwork(ssid),
      }))
      .filter((network) => network.flags.length > 0 || network.probes > 0)
      .sort((left, right) => left.ssid.localeCompare(right.ssid)),
  };
}

export function analysisToJson(analysis: Analysis): string {
  return `${JSON.stringify(analysis, null, 2)}\n`;
}

function buildDevice(mac: string, rows: Observation[], context: RadioContext | undefined): DeviceReport {
  const ordered = [...rows].sort((left, right) => left.elapsed_ms - right.elapsed_ms);
  const roles = new Set<string>();
  const channels = new Set<number>();
  const probeSsids: string[] = [];
  let deauthCount = 0;
  for (const row of ordered) {
    const role = ROLE_BY_TYPE[row.type];
    if (role) roles.add(role);
    if (row.event === "probe") roles.add("probe");
    if (row.event === "deauth") {
      roles.add("deauth");
      deauthCount += 1;
    }
    if (row.channel) channels.add(row.channel);
    if (row.event === "probe" && row.ssid && !probeSsids.includes(row.ssid)) probeSsids.push(row.ssid);
  }
  const last = ordered[ordered.length - 1];
  const fixes = ordered.filter((row) => row.latitude !== null && row.longitude !== null);
  const fix = fixes[fixes.length - 1];
  const recordIbeacon = ordered.find((row) => row.ibeacon)?.ibeacon ?? null;
  const rssiValues = ordered.map((row) => row.rssi);
  return {
    mac,
    vendor: vendorForMac(mac),
    randomized: (Number.parseInt(mac.slice(0, 2), 16) & 0x02) !== 0,
    group: isGroupAddress(mac),
    roles: [...roles],
    channels: [...channels].sort((left, right) => left - right),
    sightings: ordered.length,
    firstMs: ordered[0]?.elapsed_ms ?? 0,
    lastMs: last?.elapsed_ms ?? 0,
    rssiMin: rssiValues.length ? Math.min(...rssiValues) : 0,
    rssiMax: rssiValues.length ? Math.max(...rssiValues) : 0,
    rssiLast: last?.rssi ?? 0,
    latitude: fix?.latitude ?? null,
    longitude: fix?.longitude ?? null,
    probeSsids,
    deauthCount,
    ibeacon: recordIbeacon ?? contextIbeacon(context),
    flags: orderFlags(
      flagsForDevice({
        mac,
        probeSsids,
        deauthCount,
        loggedTypes: [...roles],
        rawTypes: [...new Set(ordered.filter((row) => row.type === "ibeacon").map((row) => row.rawType))],
        context,
        recordIbeacon,
      }),
    ),
  };
}

function isMac(value: string): boolean {
  return /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(value);
}
