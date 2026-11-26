import { decodeIBeacon, type IBeacon } from "./ibeacon";
import {
  CONTEXT_SCHEMA,
  GPS_SCALE,
  OBS_MAGIC,
  OBS_RECORD_SIZE,
  PROBE_MAGIC,
  PROBE_NAME_MAX,
  PROBE_RECORD_SIZE,
  REL_MAGIC,
  REL_RECORD_SIZE,
  TYPE_NAMES,
  type MissionFiles,
  type Observation,
  type ParseResult,
  type ParseWarning,
  type RadioContext,
  type Relationship,
} from "./types";

const utf8 = new TextDecoder("utf-8", { fatal: false });

export function parseMission(files: MissionFiles): ParseResult {
  let manifest: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(files.sessionJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "session.json must be a JSON object" };
    }
    manifest = parsed as Record<string, unknown>;
  } catch (error) {
    return { ok: false, error: `Invalid session.json: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (manifest.schema !== 1) return { ok: false, error: "Unsupported Recon manifest schema" };

  const observations = readObservations(files.observations);
  if (!observations.ok) return observations;
  const warnings = [...observations.warnings];
  const rows = observations.records;

  if (files.probes !== undefined) {
    const probes = readProbes(files.probes);
    if (!probes.ok) return probes;
    warnings.push(...probes.warnings);
    rows.push(...probes.records);
    rows.sort((left, right) => left.elapsed_ms - right.elapsed_ms);
  }

  let relationships: Relationship[] = [];
  if (files.relationships !== undefined) {
    const relations = readRelationships(files.relationships);
    if (!relations.ok) return relations;
    warnings.push(...relations.warnings);
    relationships = relations.records;
  }
  for (const row of rows) {
    if (row.event === "probe" && row.ssid) {
      relationships.push({
        source: row.mac,
        target: row.ssid,
        kind: "client-to-probed-ssid",
        confidence: "observed",
      });
    }
  }
  relationships = dedupeRelationships(relationships);

  return {
    ok: true,
    mission: {
      manifest,
      observations: rows,
      relationships,
      warnings,
      contexts: files.contexts ?? [],
    },
  };
}

export function parseRadioContext(text: string): { contexts: RadioContext[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { contexts: [], error: `Invalid radio-context.json: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { contexts: [], error: "radio-context.json must be a JSON object" };
  }
  const body = parsed as { schema?: unknown; devices?: unknown };
  if (body.schema !== CONTEXT_SCHEMA) {
    return { contexts: [], error: `Unsupported radio-context schema ${String(body.schema)}` };
  }
  if (!Array.isArray(body.devices)) return { contexts: [], error: "radio-context.json is missing devices" };
  const contexts: RadioContext[] = [];
  for (const entry of body.devices) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.mac !== "string" || !/^[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}$/.test(record.mac)) continue;
    const manufacturerData = typeof record.manufacturerData === "string" ? hexToBytes(record.manufacturerData) : undefined;
    contexts.push({
      mac: record.mac.toUpperCase(),
      localName: typeof record.localName === "string" ? record.localName : undefined,
      companyIds: numberList(record.companyIds),
      serviceUuids: stringList(record.serviceUuids),
      manufacturerData,
      beaconText: typeof record.beaconText === "string" ? record.beaconText : undefined,
      announcedSsids: stringList(record.announcedSsids),
    });
  }
  return { contexts };
}

function readObservations(data: Uint8Array): { ok: true; records: Observation[]; warnings: ParseWarning[] } | { ok: false; error: string } {
  if (!startsWith(data, OBS_MAGIC)) return { ok: false, error: "obs.rlog is not an RCN1 observation log" };
  const payload = data.subarray(4);
  const warnings: ParseWarning[] = [];
  const whole = Math.floor(payload.length / OBS_RECORD_SIZE);
  if (payload.length % OBS_RECORD_SIZE !== 0) {
    warnings.push({
      code: "truncated",
      message: `obs.rlog has ${payload.length % OBS_RECORD_SIZE} trailing byte(s) after ${whole} complete record(s). Those bytes were not decoded.`,
    });
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const records: Observation[] = [];
  for (let index = 0; index < whole; index++) {
    const offset = index * OBS_RECORD_SIZE;
    const elapsed = view.getUint32(offset, true);
    const latitude = view.getInt32(offset + 4, true);
    const longitude = view.getInt32(offset + 8, true);
    const mac = formatMac(payload.subarray(offset + 12, offset + 18));
    const rssi = view.getInt8(offset + 18);
    const channel = view.getUint8(offset + 19);
    const typeByte = view.getUint8(offset + 20);
    const rawType = typeByte < 128 ? String.fromCharCode(typeByte) : "\uFFFD";
    const position = coordinates(latitude, longitude);
    const recordBytes = payload.subarray(offset, offset + OBS_RECORD_SIZE);
    const base = rawType.toLowerCase();
    const named = TYPE_NAMES[base];
    if (!named) {
      const shown = rawType >= " " && rawType <= "~" ? `'${rawType}'` : `0x${typeByte.toString(16).padStart(2, "0")}`;
      warnings.push({
        code: "unknown-type",
        message: `Unknown observation type ${shown} at record ${index + 1}. The record was kept and the rest of the log was read.`,
      });
      records.push({
        elapsed_ms: elapsed,
        ...position,
        mac,
        rssi,
        channel,
        type: "unknown",
        event: isUpperAscii(rawType) ? "repeat" : "new",
        ssid: null,
        rawType,
        ibeacon: null,
      });
      continue;
    }
    // Uppercase is a repeat or a changed sighting, including 'I' for iBeacon and 'D' for deauth.
    const event = rawType !== base ? "repeat" : base === "d" ? "deauth" : "new";
    records.push({
      elapsed_ms: elapsed,
      ...position,
      mac,
      rssi,
      channel,
      type: named,
      event,
      ssid: null,
      rawType,
      // 21-byte RCN1 records cannot contain the 25-byte iBeacon payload. This
      // stays null on v1.21.0 files and lights up only if those bytes are present.
      ibeacon: decodeIBeacon(recordBytes),
    });
  }
  return { ok: true, records, warnings };
}

function readProbes(data: Uint8Array): { ok: true; records: Observation[]; warnings: ParseWarning[] } | { ok: false; error: string } {
  if (!startsWith(data, PROBE_MAGIC)) return { ok: false, error: "probes.rlog is not a PRB1 probe log" };
  const payload = data.subarray(4);
  const warnings: ParseWarning[] = [];
  const whole = Math.floor(payload.length / PROBE_RECORD_SIZE);
  if (payload.length % PROBE_RECORD_SIZE !== 0) {
    warnings.push({
      code: "truncated",
      message: `probes.rlog has ${payload.length % PROBE_RECORD_SIZE} trailing byte(s) after ${whole} complete probe(s).`,
    });
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const records: Observation[] = [];
  for (let index = 0; index < whole; index++) {
    const offset = index * PROBE_RECORD_SIZE;
    const length = view.getUint8(offset + 20);
    if (length > PROBE_NAME_MAX) return { ok: false, error: "Probe name length exceeds record capacity" };
    const elapsed = view.getUint32(offset, true);
    const latitude = view.getInt32(offset + 4, true);
    const longitude = view.getInt32(offset + 8, true);
    records.push({
      elapsed_ms: elapsed,
      ...coordinates(latitude, longitude),
      mac: formatMac(payload.subarray(offset + 12, offset + 18)),
      rssi: view.getInt8(offset + 18),
      channel: view.getUint8(offset + 19),
      type: "probe-request",
      event: "probe",
      ssid: utf8.decode(payload.subarray(offset + 21, offset + 21 + length)),
      rawType: "p",
      ibeacon: null,
    });
  }
  return { ok: true, records, warnings };
}

function readRelationships(data: Uint8Array): { ok: true; records: Relationship[]; warnings: ParseWarning[] } | { ok: false; error: string } {
  if (!startsWith(data, REL_MAGIC)) return { ok: false, error: "relations.rlog is not a REL1 relationship log" };
  const payload = data.subarray(4);
  const warnings: ParseWarning[] = [];
  const whole = Math.floor(payload.length / REL_RECORD_SIZE);
  if (payload.length % REL_RECORD_SIZE !== 0) {
    warnings.push({
      code: "truncated",
      message: `relations.rlog has ${payload.length % REL_RECORD_SIZE} trailing byte(s) after ${whole} complete relationship(s).`,
    });
  }
  const unique = new Map<string, Relationship>();
  for (let index = 0; index < whole; index++) {
    const offset = index * REL_RECORD_SIZE;
    const source = formatMac(payload.subarray(offset, offset + 6));
    const target = formatMac(payload.subarray(offset + 6, offset + 12));
    const key = `${source}\0${target}`;
    if (!unique.has(key)) {
      unique.set(key, { source, target, kind: "station-to-access-point", confidence: "observed" });
    }
  }
  const records = [...unique.values()].sort((left, right) => {
    if (left.source !== right.source) return left.source < right.source ? -1 : 1;
    if (left.target !== right.target) return left.target < right.target ? -1 : 1;
    return 0;
  });
  return { ok: true, records, warnings };
}

function dedupeRelationships(relationships: Relationship[]): Relationship[] {
  const seen = new Set<string>();
  const result: Relationship[] = [];
  for (const relationship of relationships) {
    const key = `${relationship.source}\0${relationship.target}\0${relationship.kind}\0${relationship.confidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(relationship);
  }
  return result;
}

function coordinates(latitude: number, longitude: number): { latitude: number | null; longitude: number | null } {
  if (latitude === 0 && longitude === 0) return { latitude: null, longitude: null };
  return { latitude: latitude / GPS_SCALE, longitude: longitude / GPS_SCALE };
}

function formatMac(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

function startsWith(data: Uint8Array, magic: string): boolean {
  if (data.length < magic.length) return false;
  for (let index = 0; index < magic.length; index++) {
    if (data[index] !== magic.charCodeAt(index)) return false;
  }
  return true;
}

function isUpperAscii(value: string): boolean {
  return value.length === 1 && value >= "A" && value <= "Z";
}

function hexToBytes(hex: string): Uint8Array | undefined {
  const cleaned = hex.replace(/\s+/g, "");
  if (cleaned.length === 0 || cleaned.length % 2 !== 0 || /[^0-9a-fA-F]/.test(cleaned)) return undefined;
  const out = new Uint8Array(cleaned.length / 2);
  for (let index = 0; index < out.length; index++) out[index] = Number.parseInt(cleaned.slice(index * 2, index * 2 + 2), 16);
  return out;
}

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const item of value) {
    if (typeof item === "number" && Number.isInteger(item) && item >= 0 && item <= 0xffff) ids.push(item);
    else if (typeof item === "string" && /^0x[0-9a-fA-F]{1,4}$/.test(item)) ids.push(Number.parseInt(item, 16));
  }
  return ids;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function ibeaconInRecord(record: Uint8Array): IBeacon | null {
  return decodeIBeacon(record);
}
