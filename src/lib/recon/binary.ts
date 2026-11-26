import { OBS_RECORD_SIZE, PROBE_NAME_MAX, PROBE_RECORD_SIZE, REL_RECORD_SIZE } from "./types";

export interface RawObservation {
  elapsedMs: number;
  latitudeE6: number;
  longitudeE6: number;
  mac: string;
  rssi: number;
  channel: number;
  type: string;
}

export interface RawProbe {
  elapsedMs: number;
  latitudeE6: number;
  longitudeE6: number;
  mac: string;
  rssi: number;
  channel: number;
  ssid: string;
}

export function macBytes(mac: string): Uint8Array {
  const parts = mac.split(":").map((part) => Number.parseInt(part, 16));
  if (parts.length !== 6 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error(`Invalid MAC ${mac}`);
  }
  return Uint8Array.from(parts);
}

export function observationLog(records: RawObservation[]): Uint8Array {
  const out = new Uint8Array(4 + records.length * OBS_RECORD_SIZE);
  out.set([0x52, 0x43, 0x4e, 0x31]);
  const view = new DataView(out.buffer);
  records.forEach((record, index) => {
    const offset = 4 + index * OBS_RECORD_SIZE;
    view.setUint32(offset, record.elapsedMs, true);
    view.setInt32(offset + 4, record.latitudeE6, true);
    view.setInt32(offset + 8, record.longitudeE6, true);
    out.set(macBytes(record.mac), offset + 12);
    view.setInt8(offset + 18, record.rssi);
    view.setUint8(offset + 19, record.channel);
    view.setUint8(offset + 20, record.type.charCodeAt(0));
  });
  return out;
}

export function probeLog(records: RawProbe[]): Uint8Array {
  const out = new Uint8Array(4 + records.length * PROBE_RECORD_SIZE);
  out.set([0x50, 0x52, 0x42, 0x31]);
  const view = new DataView(out.buffer);
  const encoder = new TextEncoder();
  records.forEach((record, index) => {
    const name = encoder.encode(record.ssid);
    if (name.length > PROBE_NAME_MAX) throw new Error("Probe SSID exceeds 24 bytes");
    const offset = 4 + index * PROBE_RECORD_SIZE;
    view.setUint32(offset, record.elapsedMs, true);
    view.setInt32(offset + 4, record.latitudeE6, true);
    view.setInt32(offset + 8, record.longitudeE6, true);
    out.set(macBytes(record.mac), offset + 12);
    view.setInt8(offset + 18, record.rssi);
    view.setUint8(offset + 19, record.channel);
    view.setUint8(offset + 20, name.length);
    out.set(name, offset + 21);
  });
  return out;
}

export function relationshipLog(pairs: Array<[string, string]>): Uint8Array {
  const out = new Uint8Array(4 + pairs.length * REL_RECORD_SIZE);
  out.set([0x52, 0x45, 0x4c, 0x31]);
  pairs.forEach(([station, accessPoint], index) => {
    const offset = 4 + index * REL_RECORD_SIZE;
    out.set(macBytes(station), offset);
    out.set(macBytes(accessPoint), offset + 6);
  });
  return out;
}
