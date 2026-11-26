import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { observationLog, probeLog, relationshipLog, type RawObservation, type RawProbe } from "../src/lib/recon/binary";
import { missionToJson, observationsToCsv } from "../src/lib/recon/export";
import { parseMission } from "../src/lib/recon/parse";
import { OBS_RECORD_SIZE } from "../src/lib/recon/types";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("parity with recon_report.py", () => {
  it("matches observations.csv and mission.json, including sort, GPS, and probe relationships", () => {
    const station = "11:22:33:44:55:66";
    const apLate = "AA:BB:CC:00:00:02";
    const apEarly = "10:00:00:00:00:01";
    const observations: RawObservation[] = [
      { elapsedMs: 5000, latitudeE6: 37_774_901, longitudeE6: -122_419_400, mac: apLate, rssi: -40, channel: 6, type: "a" },
      { elapsedMs: 1000, latitudeE6: 0, longitudeE6: 0, mac: station, rssi: -128, channel: 6, type: "s" },
      { elapsedMs: 3000, latitudeE6: 0, longitudeE6: 1_000_000, mac: "DE:AD:BE:EF:00:01", rssi: -70, channel: 0, type: "b" },
      { elapsedMs: 4000, latitudeE6: 0, longitudeE6: 0, mac: apLate, rssi: -30, channel: 11, type: "d" },
      { elapsedMs: 4500, latitudeE6: 0, longitudeE6: 0, mac: apLate, rssi: -28, channel: 11, type: "D" },
      { elapsedMs: 2000, latitudeE6: 37_774_901, longitudeE6: -122_419_400, mac: apLate, rssi: -35, channel: 6, type: "A" },
    ];
    const probes: RawProbe[] = [
      { elapsedMs: 1500, latitudeE6: 0, longitudeE6: 0, mac: station, rssi: -55, channel: 6, ssid: 'Cafe, "Main"' },
      { elapsedMs: 1500, latitudeE6: 0, longitudeE6: 0, mac: station, rssi: -55, channel: 6, ssid: 'Cafe, "Main"' },
      { elapsedMs: 1600, latitudeE6: 12, longitudeE6: -34, mac: station, rssi: -56, channel: 6, ssid: "Café" },
    ];
    const mission = writeMission("with-probes", observations, probes, [
      [station, apLate],
      [station, apLate],
      [station, apEarly],
    ]);
    const python = pythonReport(mission);
    const parsed = parseMission(readMission(mission));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(observationsToCsv(parsed.mission.observations)).toBe(python.csv);
    expect(missionToJson(parsed.mission)).toBe(python.json);
    expect(parsed.mission.observations.map((row) => row.elapsed_ms)).toEqual([1000, 1500, 1500, 1600, 2000, 3000, 4000, 4500, 5000]);
    expect(parsed.mission.observations[2]?.ssid).toBe('Cafe, "Main"');
    expect(parsed.mission.observations.find((row) => row.elapsed_ms === 3000)?.latitude).toBe(0);
    expect(parsed.mission.observations.find((row) => row.elapsed_ms === 1000)?.latitude).toBeNull();
    expect(parsed.mission.observations.find((row) => row.rawType === "D")?.event).toBe("repeat");
    expect(parsed.mission.relationships.map((row) => `${row.kind}:${row.target}`)).toEqual([
      "station-to-access-point:10:00:00:00:00:01",
      "station-to-access-point:AA:BB:CC:00:00:02",
      'client-to-probed-ssid:Cafe, "Main"',
      "client-to-probed-ssid:Café",
    ]);
  });

  it("does not sort when probes.rlog is absent, and does sort for a header-only probe file", () => {
    const unsorted: RawObservation[] = [
      { elapsedMs: 500, latitudeE6: 0, longitudeE6: 0, mac: "AA:BB:CC:00:00:09", rssi: -20, channel: 1, type: "a" },
      { elapsedMs: 100, latitudeE6: 0, longitudeE6: 0, mac: "AA:BB:CC:00:00:08", rssi: -21, channel: 1, type: "a" },
    ];
    const absent = writeMission("no-probes", unsorted, undefined, []);
    const absentPython = pythonReport(absent);
    const absentParsed = parseMission(readMission(absent, false));
    expect(absentParsed.ok).toBe(true);
    if (!absentParsed.ok) return;
    expect(observationsToCsv(absentParsed.mission.observations)).toBe(absentPython.csv);
    expect(absentParsed.mission.observations.map((row) => row.elapsed_ms)).toEqual([500, 100]);

    const emptyProbes = writeMission("empty-probes", unsorted, [], []);
    const emptyPython = pythonReport(emptyProbes);
    const emptyParsed = parseMission(readMission(emptyProbes));
    expect(emptyParsed.ok).toBe(true);
    if (!emptyParsed.ok) return;
    expect(missionToJson(emptyParsed.mission)).toBe(emptyPython.json);
    expect(emptyParsed.mission.observations.map((row) => row.elapsed_ms)).toEqual([100, 500]);
  });
});

describe("upstream iBeacon gap", () => {
  it("keeps iBeacon records that crash recon_report.py", () => {
    const script = readFileSync("tests/reference/recon_report.py", "utf8");
    expect(script).toContain('TYPE_NAMES = {"a": "access-point", "s": "station", "b": "ble", "d": "deauth"}');
    expect(script).not.toContain('"i"');

    const dir = writeMission(
      "ibeacon",
      [
        { elapsedMs: 10, latitudeE6: 0, longitudeE6: 0, mac: "02:BE:AC:00:00:01", rssi: -71, channel: 0, type: "i" },
        { elapsedMs: 20, latitudeE6: 0, longitudeE6: 0, mac: "02:BE:AC:00:00:01", rssi: -64, channel: 0, type: "I" },
      ],
      undefined,
      [],
    );
    const python = spawnSync("python3", ["tests/reference/recon_report.py", dir, "--output", join(dir, "report")], { encoding: "utf8" });
    expect(python.status).not.toBe(0);
    expect(`${python.stderr}${python.stdout}`).toMatch(/Unknown observation type/);

    const parsed = parseMission(readMission(dir, false));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mission.observations.map((row) => [row.type, row.event, row.ibeacon])).toEqual([
      ["ibeacon", "new", null],
      ["ibeacon", "repeat", null],
    ]);
    expect(parsed.mission.warnings).toEqual([]);
  });

  it("flags an unknown type and keeps the surrounding records", () => {
    const parsed = parseMission({
      sessionJson: JSON.stringify({ schema: 1 }),
      observations: observationLog([
        { elapsedMs: 1, latitudeE6: 0, longitudeE6: 0, mac: "AA:BB:CC:00:00:01", rssi: -10, channel: 1, type: "a" },
        { elapsedMs: 2, latitudeE6: 0, longitudeE6: 0, mac: "02:00:00:00:00:63", rssi: -90, channel: 1, type: "q" },
        { elapsedMs: 3, latitudeE6: 0, longitudeE6: 0, mac: "AA:BB:CC:00:00:02", rssi: -11, channel: 1, type: "a" },
      ]),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mission.observations.map((row) => row.type)).toEqual(["access-point", "unknown", "access-point"]);
    expect(parsed.mission.warnings.map((warning) => warning.code)).toEqual(["unknown-type"]);
    expect(parsed.mission.observations[1]?.rawType).toBe("q");
  });

  it("warns on a short tail instead of throwing", () => {
    const log = observationLog([{ elapsedMs: 1, latitudeE6: 0, longitudeE6: 0, mac: "AA:BB:CC:00:00:01", rssi: -10, channel: 1, type: "a" }]);
    const parsed = parseMission({ sessionJson: JSON.stringify({ schema: 1 }), observations: new Uint8Array([...log, 1, 2, 3]) });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mission.observations).toHaveLength(1);
    expect(parsed.mission.warnings[0]?.code).toBe("truncated");
    expect(OBS_RECORD_SIZE).toBe(21);
  });

  it("rejects a bad manifest, bad magic, and an overlong probe name", () => {
    expect(parseMission({ sessionJson: JSON.stringify({ schema: 2 }), observations: observationLog([]) }).ok).toBe(false);
    expect(parseMission({ sessionJson: JSON.stringify({ schema: 1 }), observations: new Uint8Array([1, 2, 3, 4]) }).ok).toBe(false);
    const probes = probeLog([]);
    const broken = new Uint8Array(probes.length + 45);
    broken.set(probes);
    broken[probes.length + 20] = 25;
    const parsed = parseMission({ sessionJson: JSON.stringify({ schema: 1 }), observations: observationLog([]), probes: broken });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/Probe name length/);
  });
});

function writeMission(name: string, observations: RawObservation[], probes: RawProbe[] | undefined, pairs: Array<[string, string]>): string {
  const root = mkdtempSync(join(tmpdir(), `recon-${name}-`));
  roots.push(root);
  const manifest = {
    schema: 1,
    state: "complete",
    mode: "wifi",
    start_ms: 10,
    duration_ms: 5000,
    ap: 1,
    station: 1,
    ble: 1,
    ibeacon: 0,
    probe: probes?.length ?? 0,
    repeat: 0,
    deauth: 1,
    dropped: 0,
    gps_fix: false,
    observations: "obs.rlog",
    probes: "probes.rlog",
    relationships: "relations.rlog",
    capture: "",
  };
  writeFileSync(join(root, "session.json"), JSON.stringify(manifest));
  writeFileSync(join(root, "obs.rlog"), observationLog(observations));
  if (probes) writeFileSync(join(root, "probes.rlog"), probeLog(probes));
  if (pairs.length > 0) writeFileSync(join(root, "relations.rlog"), relationshipLog(pairs));
  return root;
}

function readMission(dir: string, probes = true) {
  const sessionJson = readFileSync(join(dir, "session.json"), "utf8");
  const observations = new Uint8Array(readFileSync(join(dir, "obs.rlog")));
  const probePath = join(dir, "probes.rlog");
  let probeBytes: Uint8Array | undefined;
  if (probes) {
    try {
      probeBytes = new Uint8Array(readFileSync(probePath));
    } catch {
      probeBytes = undefined;
    }
  }
  let relationships: Uint8Array | undefined;
  try {
    relationships = new Uint8Array(readFileSync(join(dir, "relations.rlog")));
  } catch {
    relationships = undefined;
  }
  return { sessionJson, observations, probes: probeBytes, relationships };
}

function pythonReport(dir: string): { csv: string; json: string } {
  const output = join(dir, "report");
  execFileSync("python3", ["tests/reference/recon_report.py", dir, "--output", output], { encoding: "utf8" });
  return {
    csv: readFileSync(join(output, "observations.csv"), "utf8"),
    json: readFileSync(join(output, "mission.json"), "utf8"),
  };
}
