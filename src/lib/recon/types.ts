import type { IBeacon } from "./ibeacon";

export type { IBeacon };

export const TYPE_NAMES: Record<string, string> = {
  a: "access-point",
  s: "station",
  b: "ble",
  d: "deauth",
  i: "ibeacon",
};

export const OBS_MAGIC = "RCN1";
export const PROBE_MAGIC = "PRB1";
export const REL_MAGIC = "REL1";
export const OBS_RECORD_SIZE = 21;
export const PROBE_RECORD_SIZE = 45;
export const PROBE_NAME_MAX = 24;
export const REL_RECORD_SIZE = 12;
export const GPS_SCALE = 1_000_000;
export const CONTEXT_SCHEMA = "recon-web-context-1";

export interface Observation {
  elapsed_ms: number;
  latitude: number | null;
  longitude: number | null;
  mac: string;
  rssi: number;
  channel: number;
  type: string;
  event: string;
  ssid: string | null;
  rawType: string;
  /** Populated only when the observation bytes themselves contain an iBeacon payload. */
  ibeacon: IBeacon | null;
}

export interface Relationship {
  source: string;
  target: string;
  kind: string;
  confidence: string;
}

export interface ParseWarning {
  code: "unknown-type" | "truncated";
  message: string;
}

/** Optional supplement. Firmware v1.21.0 does not write this. */
export interface RadioContext {
  mac: string;
  localName?: string;
  companyIds: number[];
  serviceUuids: string[];
  manufacturerData?: Uint8Array;
  beaconText?: string;
  announcedSsids: string[];
}

export interface Mission {
  manifest: Record<string, unknown>;
  observations: Observation[];
  relationships: Relationship[];
  warnings: ParseWarning[];
  contexts: RadioContext[];
}

export interface MissionFiles {
  sessionJson: string;
  observations: Uint8Array;
  /** Undefined when probes.rlog is absent. Present (even if header-only) when the file exists. */
  probes?: Uint8Array;
  relationships?: Uint8Array;
  contexts?: RadioContext[];
}

export interface ParseSuccess {
  ok: true;
  mission: Mission;
}

export interface ParseFailure {
  ok: false;
  error: string;
}

export type ParseResult = ParseSuccess | ParseFailure;
