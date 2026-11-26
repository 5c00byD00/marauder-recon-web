import { observationLog, probeLog, relationshipLog, type RawObservation, type RawProbe } from "../lib/recon/binary";
import type { IngestFile } from "../lib/recon/ingest";

export const DEMO_NAME = "m9001";

const FLOCK = "B4:1E:52:10:20:01";
const HIK = "0C:75:D2:10:20:02";
const DAHUA = "74:C9:29:10:20:03";
const WYZE = "2C:AA:8E:10:20:04";
const RING = "54:E0:19:10:20:05";
const ARLO = "FC:9C:98:10:20:06";
const AXIS = "00:40:8C:10:20:07";
const GENETEC = "00:BF:15:10:20:08";
const MOTOROLA = "00:04:7D:10:20:09";
const LITEON = "E4:AA:EA:10:20:0A";
const ALFA = "00:C0:CA:10:20:0B";
const ESP_AP = "24:0A:C4:10:20:0C";
const NETGEAR = "40:5D:82:10:20:0D";
const RANDOM_AP = "02:11:22:10:20:0E";
const HAK5 = "02:C0:CA:10:20:0F";
const APPLE = "F0:EE:7A:31:00:01";
const ESP_STA = "24:0A:C4:31:00:02";
const PROBER = "02:AA:31:00:00:03";
const WYZE_STA = "02:BB:31:00:00:04";
const IBEACON = "02:BE:AC:00:00:01";
const FLIPPER = "02:F1:19:00:00:02";
const META = "02:4D:47:00:00:03";
const FINDMY = "02:A1:7A:00:00:04";
const TILE = "02:71:1E:00:00:05";
const SMARTTAG = "02:5A:47:00:00:06";
const PENGUIN = "02:F1:0C:00:00:07";
const ESP_BLE = "24:0A:C4:BE:00:08";
const UNKNOWN = "02:00:00:00:00:63";

/** 25-byte iBeacon manufacturer data: UUID 12345678-9ABC-DEF0-1234-56789ABCDEF0, major 7, minor 42, power -59. */
export const DEMO_IBEACON_MANUFACTURER = "4C000215123456789ABCDEF0123456789ABCDEF00007002AC5";

function obs(
  elapsedMs: number,
  mac: string,
  rssi: number,
  channel: number,
  type: string,
  latitudeE6 = 0,
  longitudeE6 = 0,
): RawObservation {
  return { elapsedMs, latitudeE6, longitudeE6, mac, rssi, channel, type };
}

function probe(elapsedMs: number, mac: string, rssi: number, channel: number, ssid: string): RawProbe {
  return { elapsedMs, latitudeE6: 0, longitudeE6: 0, mac, rssi, channel, ssid };
}

export function buildDemoFiles(): IngestFile[] {
  const observations: RawObservation[] = [
    obs(1_000, FLOCK, -48, 6, "a", 37_769_000, -122_419_400),
    obs(2_000, HIK, -55, 11, "a", 37_769_120, -122_419_250),
    obs(3_000, DAHUA, -61, 1, "a", 37_769_240, -122_419_100),
    obs(4_000, WYZE, -52, 6, "a", 37_769_360, -122_418_900),
    obs(5_000, RING, -58, 11, "a", 37_769_480, -122_418_700),
    obs(6_000, ARLO, -63, 6, "a"),
    obs(7_000, AXIS, -70, 36, "a", 37_769_600, -122_418_500),
    obs(8_000, GENETEC, -66, 1, "a"),
    obs(9_000, MOTOROLA, -72, 11, "a"),
    obs(10_000, LITEON, -68, 6, "a"),
    obs(11_000, ALFA, -74, 6, "a"),
    obs(12_000, ESP_AP, -40, 1, "a"),
    obs(13_000, NETGEAR, -45, 6, "a", 37_769_800, -122_418_200),
    obs(14_000, RANDOM_AP, -80, 11, "a"),
    obs(15_000, HAK5, -51, 6, "a"),
    obs(16_000, APPLE, -128, 6, "s", 37_770_000, -122_418_000),
    obs(17_000, APPLE, -60, 6, "S"),
    obs(18_000, ESP_STA, -47, 1, "s"),
    obs(19_000, ESP_STA, -49, 1, "d"),
    obs(20_000, ESP_STA, -46, 6, "d"),
    obs(21_000, PROBER, -57, 11, "s"),
    obs(22_000, WYZE_STA, -128, 6, "s"),
    obs(23_000, IBEACON, -71, 0, "i", 37_770_200, -122_417_800),
    obs(25_000, IBEACON, -64, 0, "I"),
    obs(26_000, FLIPPER, -42, 0, "b"),
    obs(27_000, META, -59, 0, "b"),
    obs(28_000, FINDMY, -77, 0, "b"),
    obs(29_000, TILE, -69, 0, "b"),
    obs(30_000, SMARTTAG, -73, 0, "b"),
    obs(31_000, PENGUIN, -66, 0, "b"),
    obs(32_000, ESP_BLE, -81, 0, "b"),
    obs(33_000, UNKNOWN, -90, 1, "q"),
    obs(34_000, FLOCK, -44, 6, "A", 37_770_400, -122_417_500),
  ];
  const probes: RawProbe[] = [
    probe(16_500, APPLE, -62, 6, "Home WiFi"),
    probe(21_500, PROBER, -58, 11, "Flock-A1B2C3"),
    probe(21_600, PROBER, -58, 6, "Pineapple_BEEF"),
    probe(21_700, PROBER, -60, 1, "pwnagotchi"),
    probe(21_800, PROBER, -60, 1, "pwned"),
    probe(21_900, PROBER, -61, 11, "HIKVISION"),
    probe(22_100, WYZE_STA, -70, 6, "wyze_cam"),
  ];
  const counts = countLikeFirmware(observations, probes.length);
  const manifest = {
    schema: 1,
    state: "complete",
    mode: "wifi",
    start_ms: 1_000,
    duration_ms: 185_000,
    ...counts,
    dropped: 0,
    gps_fix: true,
    observations: "obs.rlog",
    probes: "probes.rlog",
    relationships: "relations.rlog",
    capture: "",
  };
  const context = {
    schema: "recon-web-context-1",
    note: "Synthetic supplement for this demo. ESP32 Marauder v1.21.0 does not write radio-context.json. RCN1 records omit beacon bodies and BLE advertisement payloads, including iBeacon UUID, major, minor, and measured power.",
    devices: [
      {
        mac: IBEACON,
        localName: "iBeacon 7:42",
        manufacturerData: DEMO_IBEACON_MANUFACTURER,
      },
      { mac: FLIPPER, localName: "Flipper Black", serviceUuids: ["3082"] },
      {
        mac: META,
        localName: "Ray-Ban Meta",
        companyIds: ["0x0D53"],
        serviceUuids: ["FD5F"],
        manufacturerData: "530D",
      },
      { mac: FINDMY, manufacturerData: `4C001219${"11".repeat(25)}` },
      { mac: TILE, serviceUuids: ["FEED"] },
      { mac: SMARTTAG, serviceUuids: ["FD5A"] },
      { mac: PENGUIN, localName: "Penguin-1234567890", manufacturerData: "C809" },
    ],
  };
  const root = DEMO_NAME;
  return [
    { path: `${root}/session.json`, data: text(JSON.stringify(manifest)) },
    { path: `${root}/obs.rlog`, data: observationLog(observations) },
    { path: `${root}/probes.rlog`, data: probeLog(probes) },
    {
      path: `${root}/relations.rlog`,
      data: relationshipLog([
        [APPLE, NETGEAR],
        [PROBER, HIK],
        [WYZE_STA, WYZE],
        [PROBER, HIK],
      ]),
    },
    { path: `${root}/radio-context.json`, data: text(JSON.stringify(context, null, 2)) },
  ];
}

function countLikeFirmware(observations: RawObservation[], probeCount: number) {
  let ap = 0;
  let station = 0;
  let ble = 0;
  let ibeacon = 0;
  let repeat = 0;
  let deauth = 0;
  for (const record of observations) {
    if (record.type === "a") ap += 1;
    else if (record.type === "s") station += 1;
    else if (record.type === "b") ble += 1;
    else if (record.type === "i") {
      ble += 1;
      ibeacon += 1;
    }     else if (record.type === "d") deauth += 1;
    else if (record.type >= "A" && record.type <= "Z") repeat += 1;
  }
  return { ap, station, ble, ibeacon, probe: probeCount, repeat, deauth };
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
