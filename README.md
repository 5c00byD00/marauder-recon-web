# Marauder Recon

A browser app for reading an ESP32 Marauder Recon mission and seeing what it collected. Batch 1 is a local viewer: upload a mission, inspect the tables, export the same CSV and JSON the upstream converter writes, and review a first pass at device identification.

Nothing in the mission is sent to a server.

## Features

- Open a mission by drag and drop, a multi-file picker, a folder picker, or a `.zip`. The multi-file picker is a normal `<input type="file" multiple>` so it works in Android Chrome, which does not offer folder upload.
- Parse `session.json`, `obs.rlog`, `probes.rlog`, and `relations.rlog` in the browser.
- Summary counts, plus filterable and sortable tables for access points, stations, BLE (including iBeacon), probes, deauths, and relationships.
- Download `observations.csv` and `mission.json` in the shape produced by upstream `tools/recon_report.py`, and an `identification.json` for the flags.
- Device identification with a cited rule and a confidence for each hit. The reason is shown on the device.
- A synthetic demo mission, including an iBeacon and flagged devices, so the app can be tried without hardware.

## Privacy

Recon files contain uncensored MAC addresses, SSIDs, and GPS. The Marauder censor option does not redact `.rlog` or `session.json`. This app reads those files only in the browser. There is no account, no analytics call, and no upload. The OUI table is bundled. Citation links are ordinary links you choose to open.

Treat a relationship as an observation. A station probing an SSID, or seen near an access point, is not proof of ownership or of a current association.

## File format

Checked against [ESP32Marauder](https://github.com/justcallmekoko/ESP32Marauder) tag `v1.21.0` (`master` at the time of that tag): `tools/recon_report.py`, `tools/recon_converter.py`, `tools/RECON_CONVERTER_README.md`, `esp32_marauder/ReconMission.cpp`, `esp32_marauder/IBeacon.h`, and the wiki pages [Recon](https://github.com/justcallmekoko/ESP32Marauder/wiki/Recon) and [Recon-Desktop-Tool](https://github.com/justcallmekoko/ESP32Marauder/wiki/Recon-Desktop-Tool).

A mission is a `/recon/m####/` directory.

| File | Role |
| --- | --- |
| `session.json` | Schema 1 manifest: mode, state, duration, counters, GPS-fix flag, and the log filenames. |
| `obs.rlog` | `RCN1` plus 21-byte records: elapsed ms, latitude and longitude as degrees × 1,000,000, MAC, RSSI, channel, type. |
| `probes.rlog` | Optional `PRB1` records, 45 bytes, with a probe SSID of at most 24 bytes. |
| `relations.rlog` | Optional `REL1` pairs of station MAC and AP MAC. |
| `*.pcap` | Present for Wi-Fi missions. Upstream ignores it. This app lists it and does not parse it yet. |

Type bytes in `obs.rlog`: `a`/`A` access point, `s`/`S` station, `b`/`B` BLE, `d` deauth, `i`/`I` iBeacon. A lowercase letter is the first sighting (`d` is the deauth itself). An uppercase letter is a repeat or a changed sighting, including `I` and `D`. The first station sighting is stored with RSSI `-128` because the firmware does not have one yet.

`0,0` latitude and longitude means no GPS fix. A fix on only one axis is kept.

Upstream `TYPE_NAMES` has no `i`, so an iBeacon mission makes `recon_report.py` raise `Unknown observation type`. The wiki still says `i` is a new iBeacon and `I` is a repeat, and `ReconMission.cpp` writes those bytes after `parseIBeacon` succeeds. This app keeps them as type `ibeacon`. Any other unknown type is kept and flagged. It does not abort the parse.

The iBeacon UUID, major, minor, and measured power are **not** in the 21-byte record. `IBeacon.h` parses a 25-byte Apple payload (`4C 00 02 15`, then UUID, major, minor, and measured power) into RAM, and `writeObservation` does not persist it. Those fields are decoded when the bytes are present: inside a record that actually contains them, or in an optional `radio-context.json` supplement. The Marauder does not write that supplement. The demo includes one so the identification rules that need advertisement bytes can be reviewed. Real missions without it still open.

Probe names are merged into the observation list and the whole list is sorted by elapsed time only when the probe file exists, matching `recon_report.py`. Station-to-AP relationships are sorted and de-duplicated, then client-to-probed-SSID rows are appended.

## Device identification

Rules live in `src/data/signatures.json`. Each rule has a confidence (`high`, `medium`, or `low`) and at least one source. The OUI table is an offline IEEE MA-L snapshot (`src/data/oui-orgs.json`, retrieved 2026-11-26). Locally administered addresses are not given a vendor: the U/L bit means there is no universal OUI.

Hits covered in this pass:

- Meta / Ray-Ban glasses, from the name plus BLE service `0xFD5F`, with weaker company-ID rules kept separate.
- Flock Safety's own OUI, DeFlock-style SSID patterns, the module-vendor prefixes in the Marauder flock list at low confidence, and the firmware's XUNTONG plus Penguin name check.
- Other ALPR vendors by IEEE registrant: Genetec Inc. and Motorola Solutions. A block that is only on a community list, or that belongs to a different company, is not promoted. `00:0E:58` is Sonos and is not flagged.
- IP cameras: Hikvision, Dahua, Wyze, Ring, Arlo, and Axis, by IEEE organization name, plus SSID patterns.
- Hacking gear: Flipper Zero service UUIDs `0x3081`–`0x3083`, WiFi Pineapple `Pineapple_` SSIDs, Hak5's locally administered prefixes at low confidence, Alfa and Orient Power module notes, deauther `pwned` SSIDs, pwnagotchi names and the `pwnd_tot` beacon key, and Espressif OUIs only when that MAC also sent deauth frames.
- Trackers: Apple Find My type `0x12` (not company ID `0x004C` alone), Find My Network Accessory `0xFD44`, the unwanted-tracker service, Tile `0xFEED`/`0xFEEC`, and Samsung SmartTag `0xFD5A`.
- iBeacon, from the log type and from a decoded payload.
- Randomized / locally administered MACs.

The Pineapple Pager has no published unique SSID or OUI. Hak5's PineAP notes say it can advertise an arbitrary SSID pool and randomize the BSSID, so a miss does not clear it, and the Mark-series `Pineapple_` name is not claimed as a Pager signature.

BLE company IDs and service UUIDs can be evaluated only when advertisement bytes are available. v1.21.0 does not store them in `obs.rlog`.

## Dev setup

Node.js 22 and Python 3.10 or newer. Python is used only by the parity tests.

```bash
npm install
npm test
npm run dev
npm run build
```

`npm test` runs the Vitest suite, including a byte-for-byte check of `observations.csv` and `mission.json` against the vendored `recon_report.py`. `npm run build` typechecks and builds the static site into `dist/`.

CI on pull requests runs `npm ci`, `npm test`, and `npm run build`. It does not deploy GitHub Pages.

To refresh the OUI snapshot, download the IEEE MA-L CSV and run `python3 scripts/build-oui.py oui.csv`.

## Roadmap

- Map and timeline of the GPS fixes and sightings.
- Follower and deauth analysis: who stayed with the route, and which deauth transmitters repeat.
- Recover AP SSIDs and BLE advertisements from the mission pcap, which this batch only lists.
- PWA and offline install, including a service worker around the bundled OUI table.
- GitHub Pages deploy.
- Android app wrapping the same local parser.
