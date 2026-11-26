import type { Mission, Observation, Relationship } from "./types";

class PyFloat {
  constructor(readonly value: number) {}
}

/** Python json.dumps / str() for the GPS-scaled floats recon_report.py writes. */
export function pythonFloat(value: number): string {
  if (Object.is(value, -0) || value === 0) return "0.0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs < 1e-4 || abs >= 1e16) {
    const scientific = abs.toExponential().replace(/e([+-])(\d)$/, (_, exponentSign: string, digit: string) => `e${exponentSign}0${digit}`);
    return sign + scientific;
  }
  if (Number.isInteger(value)) return sign + abs.toFixed(1);
  let text = abs.toString();
  if (!text.includes(".") && !text.includes("e")) text += ".0";
  if (text.includes("e")) {
    text = text.replace(/e([+-])(\d)$/, (_, exponentSign: string, digit: string) => `e${exponentSign}0${digit}`);
  }
  return sign + text;
}

export function observationsToCsv(observations: Observation[]): string {
  const header = ["elapsed_ms", "latitude", "longitude", "mac", "rssi", "channel", "type", "event", "ssid"];
  const lines = [header.join(",")];
  for (const observation of observations) {
    lines.push(
      [
        String(observation.elapsed_ms),
        observation.latitude === null ? "" : pythonFloat(observation.latitude),
        observation.longitude === null ? "" : pythonFloat(observation.longitude),
        csvField(observation.mac),
        String(observation.rssi),
        String(observation.channel),
        csvField(observation.type),
        csvField(observation.event),
        observation.ssid === null ? "" : csvField(observation.ssid),
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export function missionToJson(mission: Pick<Mission, "manifest" | "observations" | "relationships">): string {
  const payload = {
    manifest: mission.manifest,
    observations: mission.observations.map((observation) => ({
      elapsed_ms: observation.elapsed_ms,
      latitude: observation.latitude === null ? null : new PyFloat(observation.latitude),
      longitude: observation.longitude === null ? null : new PyFloat(observation.longitude),
      mac: observation.mac,
      rssi: observation.rssi,
      channel: observation.channel,
      type: observation.type,
      event: observation.event,
      ssid: observation.ssid,
    })),
    relationships: mission.relationships.map((relationship) => ({
      source: relationship.source,
      target: relationship.target,
      kind: relationship.kind,
      confidence: relationship.confidence,
    })),
  };
  return `${pythonJson(payload)}\n`;
}

export function pythonJson(value: unknown, level = 0): string {
  if (value instanceof PyFloat) return pythonFloat(value.value);
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : pythonFloat(value);
  if (typeof value === "string") return pythonString(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const pad = " ".repeat((level + 1) * 2);
    const end = " ".repeat(level * 2);
    return `[\n${value.map((item) => `${pad}${pythonJson(item, level + 1)}`).join(",\n")}\n${end}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const pad = " ".repeat((level + 1) * 2);
    const end = " ".repeat(level * 2);
    return `{\n${entries.map(([key, item]) => `${pad}${pythonString(key)}: ${pythonJson(item, level + 1)}`).join(",\n")}\n${end}}`;
  }
  return "null";
}

function pythonString(value: string): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export type { Relationship };
