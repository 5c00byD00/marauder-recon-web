import { describe, expect, it } from "vitest";
import { buildDemoFiles } from "../src/demo/mission";
import { analyze } from "../src/lib/identify/analyze";
import { flagsForDevice } from "../src/lib/identify/identify";
import { lookupOui, vendorForMac } from "../src/lib/identify/oui";
import { SIGNATURES } from "../src/lib/identify/rules";
import { filesFromZip, ingestFiles } from "../src/lib/recon/ingest";
import { zipSync } from "fflate";

describe("vendor lookup", () => {
  it("uses the IEEE snapshot and ignores locally administered addresses", () => {
    expect(lookupOui("B41E52")).toBe("Flock Safety");
    expect(lookupOui("4827EA")).toBe("Samsung Electronics Co.,Ltd");
    expect(lookupOui("000E58")).toBe("Sonos, Inc.");
    expect(lookupOui("0C75D2")).toContain("Hikvision");
    expect(vendorForMac("B4:1E:52:10:20:01")).toBe("Flock Safety");
    expect(vendorForMac("02:C0:CA:10:20:0F")).toBeNull();
    expect(vendorForMac("F0:EE:7A:31:00:01")).toBe("Apple, Inc.");
  });
});

describe("signatures", () => {
  it("gives every rule a confidence and an https citation", () => {
    const ids = new Set(SIGNATURES.map((rule) => rule.id));
    expect(ids.size).toBe(SIGNATURES.length);
    for (const rule of SIGNATURES) {
      expect(["high", "medium", "low"]).toContain(rule.confidence);
      expect(rule.sources.length).toBeGreaterThan(0);
      expect(rule.because.length).toBeGreaterThan(20);
    }
  });

  it("does not call a Sonos OUI an ALPR camera", () => {
    const flags = flagsForDevice({
      mac: "00:0E:58:00:00:01",
      probeSsids: [],
      deauthCount: 0,
      loggedTypes: ["access-point"],
      rawTypes: [],
      recordIbeacon: null,
    });
    expect(flags.map((flag) => flag.ruleId)).not.toContain("genetec-oui");
    expect(flags.map((flag) => flag.category)).not.toContain("alpr");
  });

  it("flags an Espressif deauth differently from a quiet Espressif radio", () => {
    const quiet = flagsForDevice({
      mac: "24:0A:C4:10:20:0C",
      probeSsids: [],
      deauthCount: 0,
      loggedTypes: ["access-point"],
      rawTypes: [],
      recordIbeacon: null,
    });
    const loud = flagsForDevice({
      mac: "24:0A:C4:31:00:02",
      probeSsids: [],
      deauthCount: 2,
      loggedTypes: ["station", "deauth"],
      rawTypes: [],
      recordIbeacon: null,
    });
    expect(quiet.map((flag) => flag.ruleId)).not.toContain("espressif-deauth");
    expect(loud.map((flag) => flag.ruleId)).toContain("espressif-deauth");
    expect(loud.map((flag) => flag.ruleId)).not.toContain("deauth-activity");
  });

  it("reads a pwnagotchi beacon body and a base-UUID service", () => {
    const beacon = flagsForDevice({
      mac: "AA:BB:CC:00:00:10",
      probeSsids: [],
      deauthCount: 0,
      loggedTypes: ["access-point"],
      rawTypes: [],
      recordIbeacon: null,
      context: {
        mac: "AA:BB:CC:00:00:10",
        companyIds: [],
        serviceUuids: [],
        announcedSsids: [],
        beaconText: '{"name":"demo","pwnd_tot":3}',
      },
    });
    expect(beacon.map((flag) => flag.ruleId)).toContain("pwnagotchi-beacon");
    const tag = flagsForDevice({
      mac: "02:5A:47:00:00:06",
      probeSsids: [],
      deauthCount: 0,
      loggedTypes: ["ble"],
      rawTypes: [],
      recordIbeacon: null,
      context: {
        mac: "02:5A:47:00:00:06",
        companyIds: [],
        serviceUuids: ["0000fd5a-0000-1000-8000-00805f9b34fb"],
        announcedSsids: [],
      },
    });
    expect(tag.map((flag) => flag.ruleId)).toContain("smarttag-service");
  });
});

describe("demo mission", () => {
  it("loads every record type and flags the covered device kinds", () => {
    const ingested = ingestFiles(buildDemoFiles());
    expect(ingested.errors).toEqual([]);
    expect(ingested.missions).toHaveLength(1);
    const mission = ingested.missions[0]?.mission;
    if (!mission) throw new Error("missing demo");
    const analysis = analyze(mission);
    expect(mission.observations.some((row) => row.type === "access-point")).toBe(true);
    expect(mission.observations.some((row) => row.type === "station")).toBe(true);
    expect(mission.observations.some((row) => row.type === "ble")).toBe(true);
    expect(mission.observations.some((row) => row.type === "ibeacon" && row.event === "new")).toBe(true);
    expect(mission.observations.some((row) => row.type === "ibeacon" && row.event === "repeat")).toBe(true);
    expect(mission.observations.some((row) => row.event === "probe")).toBe(true);
    expect(mission.observations.some((row) => row.event === "deauth")).toBe(true);
    expect(mission.relationships.length).toBeGreaterThan(0);
    expect(mission.warnings.some((warning) => warning.code === "unknown-type")).toBe(true);

    const ids = (mac: string) => analysis.devices.find((device) => device.mac === mac)?.flags.map((flag) => flag.ruleId) ?? [];
    expect(ids("B4:1E:52:10:20:01")).toContain("flock-safety-oui");
    expect(ids("0C:75:D2:10:20:02")).toContain("hikvision-oui");
    expect(ids("74:C9:29:10:20:03")).toContain("dahua-oui");
    expect(ids("2C:AA:8E:10:20:04")).toContain("wyze-oui");
    expect(ids("54:E0:19:10:20:05")).toContain("ring-oui");
    expect(ids("FC:9C:98:10:20:06")).toContain("arlo-oui");
    expect(ids("00:40:8C:10:20:07")).toContain("axis-oui");
    expect(ids("00:BF:15:10:20:08")).toContain("genetec-oui");
    expect(ids("00:04:7D:10:20:09")).toContain("motorola-solutions-oui");
    expect(ids("E4:AA:EA:10:20:0A")).toContain("flock-module-oui");
    expect(ids("00:C0:CA:10:20:0B")).toContain("alfa-module");
    expect(ids("24:0A:C4:31:00:02")).toContain("espressif-deauth");
    expect(ids("24:0A:C4:10:20:0C")).not.toContain("espressif-deauth");
    expect(ids("02:C0:CA:10:20:0F")).toEqual(expect.arrayContaining(["hak5-local-mac", "random-mac"]));
    expect(ids("02:F1:19:00:00:02")).toContain("flipper-service");
    expect(ids("02:4D:47:00:00:03")).toContain("meta-composite");
    expect(ids("02:4D:47:00:00:03")).not.toContain("meta-service");
    expect(ids("02:A1:7A:00:00:04")).toContain("findmy-offline");
    expect(ids("02:71:1E:00:00:05")).toContain("tile-service");
    expect(ids("02:5A:47:00:00:06")).toContain("smarttag-service");
    expect(ids("02:F1:0C:00:00:07")).toContain("flock-ble-named");
    expect(ids("02:AA:31:00:00:03")).toEqual(expect.arrayContaining(["flock-ssid-pattern", "pineapple-ssid", "pwnagotchi-ssid", "pwned-ssid", "hikvision-ssid"]));
    const beacon = analysis.devices.find((device) => device.mac === "02:BE:AC:00:00:01");
    expect(beacon?.flags.map((flag) => flag.ruleId)).toEqual(expect.arrayContaining(["ibeacon-logged", "ibeacon-payload", "random-mac"]));
    expect(beacon?.ibeacon).toEqual({
      uuid: "12345678-9ABC-DEF0-1234-56789ABCDEF0",
      major: 7,
      minor: 42,
      txPower: -59,
    });
    expect(analysis.networks.find((network) => network.ssid === "Flock-A1B2C3")?.flags[0]?.confidence).toBe("high");
    expect(analysis.networks.find((network) => network.ssid === "Home WiFi")?.flags).toEqual([]);
    expect(analysis.devices.filter((device) => device.roles.includes("access-point")).length).toBeGreaterThan(0);
    expect(analysis.devices.filter((device) => device.roles.includes("station")).length).toBeGreaterThan(0);
    expect(analysis.devices.filter((device) => device.roles.includes("ble") || device.roles.includes("ibeacon")).length).toBeGreaterThan(0);
  });

  it("round-trips the demo through a zip", () => {
    const entries: Record<string, Uint8Array> = {};
    for (const file of buildDemoFiles()) entries[file.path] = file.data;
    const unzipped = ingestFiles(filesFromZip(zipSync(entries)));
    expect(unzipped.missions[0]?.name).toBe("m9001");
    expect(unzipped.missions[0]?.mission.observations.length).toBeGreaterThan(10);
  });
});
