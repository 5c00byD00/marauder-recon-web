import { useMemo, useState } from "react";
import type { Analysis, DeviceReport } from "../lib/identify/analyze";
import type { Flag } from "../lib/identify/identify";
import type { LoadedMission } from "../lib/recon/ingest";
import type { Observation, Relationship } from "../lib/recon/types";
import { confidenceLabel, formatChannel, formatCoord, formatDuration, formatElapsed } from "./format";
import { DataTable, type Column } from "./Table";

const TABS = [
  ["overview", "Overview"],
  ["aps", "APs"],
  ["stations", "Stations"],
  ["ble", "BLE"],
  ["probes", "Probes"],
  ["deauths", "Deauths"],
  ["relations", "Relations"],
  ["flags", "Flags"],
] as const;

type TabId = (typeof TABS)[number][0];

export function MissionScreen({ loaded, analysis }: { loaded: LoadedMission; analysis: Analysis }) {
  const [tab, setTab] = useState<TabId>("overview");
  const { mission } = loaded;
  const manifest = mission.manifest;
  const flagged = analysis.devices.filter((device) => device.flags.length > 0).length;

  return (
    <section className="mission">
      <header className="mission-head">
        <div>
          <p className="kicker">Mission</p>
          <h2>{loaded.name}</h2>
          <p className="sub">
            {text(manifest.mode, "unknown")} · {text(manifest.state, "unknown")} · {formatDuration(numberOr(manifest.duration_ms, 0))}
            {mission.contexts.length > 0 ? " · advertisement supplement" : ""}
          </p>
        </div>
        <p className="flag-count">{flagged} flagged devices</p>
      </header>
      <div className="tabs" role="tablist" aria-label="Mission views">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "tab active" : "tab"} onClick={() => setTab(id)}>
            {label}
            {id === "flags" ? ` ${flagged}` : ""}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview loaded={loaded} analysis={analysis} />}
      {tab === "aps" && <DeviceTab devices={analysis.devices.filter((device) => device.roles.includes("access-point"))} empty="No access points in this mission." />}
      {tab === "stations" && (
        <>
          <p className="note">The first station sighting is stored with RSSI -128. The firmware does not have a station RSSI at that moment; a later repeat can carry one.</p>
          <DeviceTab devices={analysis.devices.filter((device) => device.roles.includes("station"))} empty="No stations in this mission." />
        </>
      )}
      {tab === "ble" && <BleTab devices={analysis.devices.filter((device) => device.roles.includes("ble") || device.roles.includes("ibeacon"))} />}
      {tab === "probes" && <ProbeTab rows={mission.observations.filter((row) => row.event === "probe")} />}
      {tab === "deauths" && <DeauthTab rows={mission.observations.filter((row) => row.event === "deauth")} />}
      {tab === "relations" && <RelationTab rows={mission.relationships} />}
      {tab === "flags" && <FlagsTab analysis={analysis} />}
    </section>
  );
}

function Overview({ loaded, analysis }: { loaded: LoadedMission; analysis: Analysis }) {
  const { mission } = loaded;
  const observations = mission.observations;
  const cards = [
    ["Sightings", observations.length],
    ["Access points", countNew(observations, "access-point")],
    ["Stations", countNew(observations, "station")],
    ["BLE excl. iBeacon", countNew(observations, "ble")],
    ["iBeacons", countNew(observations, "ibeacon")],
    ["Probes", observations.filter((row) => row.event === "probe").length],
    ["Deauths", observations.filter((row) => row.event === "deauth").length],
    ["Repeats", observations.filter((row) => row.event === "repeat").length],
    ["Relations", mission.relationships.length],
    ["GPS fixes", observations.filter((row) => row.latitude !== null).length],
    ["Unknown", observations.filter((row) => row.type === "unknown").length],
    ["Flagged", analysis.devices.filter((device) => device.flags.length > 0).length],
  ];
  const categories = new Map<string, number>();
  for (const device of analysis.devices) {
    for (const flag of device.flags) categories.set(flag.category, (categories.get(flag.category) ?? 0) + 1);
  }
  return (
    <div className="stack">
      {mission.warnings.length > 0 && (
        <ul className="warnings">
          {mission.warnings.map((warning) => (
            <li key={warning.message}>{warning.message}</li>
          ))}
        </ul>
      )}
      {loaded.pcap.length > 0 && (
        <p className="note">
          Packet capture included ({loaded.pcap.join(", ")}). This version lists it and does not parse it. Upstream's converter ignores it too. AP SSIDs and most BLE payloads are not in the RCN1 log.
        </p>
      )}
      {mission.contexts.length > 0 && (
        <p className="note">
          This folder includes radio-context.json. That file is not written by the Marauder. It supplies advertisement fields the v1.21.0 log leaves out, and every flag that uses it says so.
        </p>
      )}
      <div className="cards">
        {cards.map(([label, value]) => (
          <article key={String(label)} className="card">
            <p className="card-value">{value}</p>
            <p className="card-label">{label}</p>
          </article>
        ))}
      </div>
      <section className="panel">
        <h3>Firmware counters</h3>
        <p className="fine">
          session.json recorded ap {text(mission.manifest.ap, "—")}, station {text(mission.manifest.station, "—")}, ble {text(mission.manifest.ble, "—")}, ibeacon{" "}
          {text(mission.manifest.ibeacon, "—")}, probe {text(mission.manifest.probe, "—")}, repeat {text(mission.manifest.repeat, "—")}, deauth {text(mission.manifest.deauth, "—")}, dropped{" "}
          {text(mission.manifest.dropped, "—")}, gps {text(mission.manifest.gps_fix, "—")}. BLE in that file counts iBeacons as well. An active mission can have incomplete totals.
        </p>
      </section>
      <section className="panel">
        <h3>What a hit means</h3>
        <p className="fine">
          A flag is a cited rule with a confidence, not a verdict. Probe requests show a name a station asked for. A module-vendor OUI on a community camera list is a low-confidence lead. Locally administered MACs have no vendor. iBeacon UUID, major, minor, and measured power are decoded only when those bytes are actually present.
        </p>
        <ul className="legend">
          {[...categories.entries()].sort().map(([category, count]) => (
            <li key={category}>
              <span className={`pill cat-${category}`}>{category}</span> {count}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function DeviceTab({ devices, empty }: { devices: DeviceReport[]; empty: string }) {
  const columns: Column<DeviceReport>[] = [
    { id: "identity", label: "Identity", sortValue: (row) => identity(row), cell: (row) => <Identity device={row} /> },
    { id: "mac", label: "MAC", sortValue: (row) => row.mac, cell: (row) => <span className="mono">{row.mac}</span>, className: "mono" },
    { id: "vendor", label: "Vendor", sortValue: (row) => row.vendor ?? "", cell: (row) => vendorText(row) },
    { id: "rssi", label: "RSSI", sortValue: (row) => row.rssiLast, cell: (row) => `${row.rssiLast}` },
    { id: "channel", label: "Channel", sortValue: (row) => row.channels[0] ?? 0, cell: (row) => row.channels.map(formatChannel).join(", ") || "—" },
    { id: "sightings", label: "Sightings", sortValue: (row) => row.sightings, cell: (row) => row.sightings },
    { id: "last", label: "Last", sortValue: (row) => row.lastMs, cell: (row) => formatElapsed(row.lastMs) },
    { id: "flags", label: "Flags", sortValue: (row) => row.flags.length, cell: (row) => <FlagDetails flags={row.flags} /> },
  ];
  return <DataTable rows={devices} columns={columns} text={deviceText} rowKey={(row) => row.mac} empty={empty} initialSort="mac" />;
}

function BleTab({ devices }: { devices: DeviceReport[] }) {
  const columns: Column<DeviceReport>[] = [
    { id: "kind", label: "Kind", sortValue: (row) => (row.roles.includes("ibeacon") ? "ibeacon" : "ble"), cell: (row) => (row.roles.includes("ibeacon") ? "iBeacon" : "BLE") },
    { id: "mac", label: "MAC", sortValue: (row) => row.mac, cell: (row) => <span className="mono">{row.mac}</span> },
    { id: "vendor", label: "Vendor", sortValue: (row) => row.vendor ?? "", cell: (row) => vendorText(row) },
    { id: "rssi", label: "RSSI", sortValue: (row) => row.rssiLast, cell: (row) => row.rssiLast },
    { id: "uuid", label: "UUID", sortValue: (row) => row.ibeacon?.uuid ?? "", cell: (row) => <span className="mono">{row.ibeacon?.uuid ?? "—"}</span> },
    { id: "major", label: "Major", sortValue: (row) => row.ibeacon?.major ?? -1, cell: (row) => row.ibeacon?.major ?? "—" },
    { id: "minor", label: "Minor", sortValue: (row) => row.ibeacon?.minor ?? -1, cell: (row) => row.ibeacon?.minor ?? "—" },
    { id: "power", label: "Tx", sortValue: (row) => row.ibeacon?.txPower ?? -999, cell: (row) => (row.ibeacon ? row.ibeacon.txPower : "—") },
    { id: "flags", label: "Flags", sortValue: (row) => row.flags.length, cell: (row) => <FlagDetails flags={row.flags} /> },
  ];
  return (
    <>
      <p className="note">
        iBeacon rows come from obs.rlog type i/I. UUID, major, minor, and measured power stay blank unless those bytes were in the record or in a radio-context supplement. v1.21.0 does not write them into the 21-byte record.
      </p>
      {devices.some((device) => device.roles.includes("ibeacon")) && (
        <ul className="beacon-list">
          {devices
            .filter((device) => device.roles.includes("ibeacon"))
            .map((device) => (
              <li key={device.mac}>
                <span className="mono">{device.mac}</span>
                {device.ibeacon ? (
                  <span>
                    {" "}
                    {device.ibeacon.uuid} · major {device.ibeacon.major} · minor {device.ibeacon.minor} · {device.ibeacon.txPower} dBm
                  </span>
                ) : (
                  <span> iBeacon logged, payload not in the record</span>
                )}
              </li>
            ))}
        </ul>
      )}
      <DataTable rows={devices} columns={columns} text={deviceText} rowKey={(row) => row.mac} empty="No BLE or iBeacon devices in this mission." initialSort="mac" />
    </>
  );
}

function ProbeTab({ rows }: { rows: Observation[] }) {
  const columns: Column<Observation>[] = [
    { id: "time", label: "Elapsed", sortValue: (row) => row.elapsed_ms, cell: (row) => formatElapsed(row.elapsed_ms) },
    { id: "mac", label: "MAC", sortValue: (row) => row.mac, cell: (row) => <span className="mono">{row.mac}</span> },
    { id: "ssid", label: "SSID", sortValue: (row) => row.ssid ?? "", cell: (row) => row.ssid || "—" },
    { id: "rssi", label: "RSSI", sortValue: (row) => row.rssi, cell: (row) => row.rssi },
    { id: "channel", label: "Channel", sortValue: (row) => row.channel, cell: (row) => formatChannel(row.channel) },
    { id: "gps", label: "Position", sortValue: (row) => row.latitude ?? 0, cell: (row) => formatCoord(row.latitude, row.longitude) },
  ];
  return <DataTable rows={rows} columns={columns} text={(row) => `${row.mac} ${row.ssid ?? ""}`} rowKey={(row) => `${row.elapsed_ms}-${row.mac}-${row.ssid}`} empty="No probe requests in this mission." />;
}

function DeauthTab({ rows }: { rows: Observation[] }) {
  const columns: Column<Observation>[] = [
    { id: "time", label: "Elapsed", sortValue: (row) => row.elapsed_ms, cell: (row) => formatElapsed(row.elapsed_ms) },
    { id: "mac", label: "Transmitter", sortValue: (row) => row.mac, cell: (row) => <span className="mono">{row.mac}</span> },
    { id: "rssi", label: "RSSI", sortValue: (row) => row.rssi, cell: (row) => row.rssi },
    { id: "channel", label: "Channel", sortValue: (row) => row.channel, cell: (row) => formatChannel(row.channel) },
    { id: "gps", label: "Position", sortValue: (row) => row.latitude ?? 0, cell: (row) => formatCoord(row.latitude, row.longitude) },
  ];
  return (
    <>
      <p className="note">The log stores the transmitter address from the deauth frame. It does not store the reason code or the BSSID.</p>
      <DataTable rows={rows} columns={columns} text={(row) => row.mac} rowKey={(row) => `${row.elapsed_ms}-${row.mac}-${row.rssi}`} empty="No deauth frames in this mission." />
    </>
  );
}

function RelationTab({ rows }: { rows: Relationship[] }) {
  const columns: Column<Relationship>[] = [
    { id: "kind", label: "Kind", sortValue: (row) => row.kind, cell: (row) => row.kind },
    { id: "source", label: "Source", sortValue: (row) => row.source, cell: (row) => <span className="mono">{row.source}</span> },
    { id: "target", label: "Target", sortValue: (row) => row.target, cell: (row) => row.target },
    { id: "confidence", label: "Confidence", sortValue: (row) => row.confidence, cell: (row) => row.confidence },
  ];
  return (
    <>
      <p className="note">A relationship is something the radio observed. A client probing an SSID, or a station seen with an AP, is not proof of ownership or a current association.</p>
      <DataTable rows={rows} columns={columns} text={(row) => `${row.kind} ${row.source} ${row.target}`} rowKey={(row) => `${row.kind}-${row.source}-${row.target}`} empty="No relationships in this mission." />
    </>
  );
}

function FlagsTab({ analysis }: { analysis: Analysis }) {
  const [includePrivacy, setIncludePrivacy] = useState(true);
  const devices = useMemo(() => {
    return analysis.devices
      .map((device) => ({
        ...device,
        flags: includePrivacy ? device.flags : device.flags.filter((flag) => flag.category !== "privacy"),
      }))
      .filter((device) => device.flags.length > 0)
      .sort((left, right) => rank(right.flags) - rank(left.flags) || left.mac.localeCompare(right.mac));
  }, [analysis.devices, includePrivacy]);
  const networks = analysis.networks.filter((network) => network.flags.length > 0);
  return (
    <div className="stack">
      <label className="check">
        <input type="checkbox" checked={includePrivacy} onChange={(event) => setIncludePrivacy(event.target.checked)} />
        Show locally administered MAC flags
      </label>
      <h3>Devices</h3>
      {devices.length === 0 ? <p className="empty">No flagged devices for this filter.</p> : devices.map((device) => <FlagCard key={device.mac} device={device} />)}
      <h3>Probed names</h3>
      {networks.length === 0 ? (
        <p className="empty">No probed SSID matched a signature.</p>
      ) : (
        networks.map((network) => (
          <article key={network.ssid} className="flag-card">
            <header>
              <h4>{network.ssid}</h4>
              <p className="fine">
                {network.probes} probe{network.probes === 1 ? "" : "s"} from {network.probers.length} station{network.probers.length === 1 ? "" : "s"}
              </p>
            </header>
            <FlagList flags={network.flags} />
          </article>
        ))
      )}
    </div>
  );
}

function FlagCard({ device }: { device: DeviceReport }) {
  return (
    <article className="flag-card">
      <header>
        <h4 className="mono">{device.mac}</h4>
        <p className="fine">
          {vendorText(device)} · {device.roles.join(", ") || "seen"} · {device.sightings} sighting{device.sightings === 1 ? "" : "s"}
          {device.ibeacon ? ` · ${device.ibeacon.uuid} ${device.ibeacon.major}/${device.ibeacon.minor} @ ${device.ibeacon.txPower} dBm` : ""}
        </p>
      </header>
      <FlagList flags={device.flags} />
    </article>
  );
}

function FlagList({ flags }: { flags: Flag[] }) {
  return (
    <ul className="reasons">
      {flags.map((flag) => (
        <li key={`${flag.ruleId}-${flag.because}`}>
          <p className="reason-title">
            <span className={`pill cat-${flag.category}`}>{flag.title}</span>
            <span className={`conf conf-${flag.confidence}`}>{confidenceLabel(flag.confidence)}</span>
            <span className="evidence">{flag.evidence}</span>
          </p>
          <p>{flag.because}</p>
          <p className="sources">
            {flag.sources.map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
            ))}
          </p>
        </li>
      ))}
    </ul>
  );
}

function FlagDetails({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return <span className="muted">—</span>;
  return (
    <details>
      <summary>{flags.map((flag) => flag.title).join(", ")}</summary>
      <FlagList flags={flags} />
    </details>
  );
}

function Identity({ device }: { device: DeviceReport }) {
  const named = device.flags.find((flag) => flag.category !== "privacy");
  return <span>{named?.title ?? (device.randomized ? "Local MAC" : "Unclassified")}</span>;
}

function vendorText(device: DeviceReport): string {
  if (device.group) return "Group address";
  if (device.randomized) return "Locally administered";
  return device.vendor ?? "Unknown OUI";
}

function identity(device: DeviceReport): string {
  return device.flags.find((flag) => flag.category !== "privacy")?.title ?? device.vendor ?? device.mac;
}

function deviceText(device: DeviceReport): string {
  return [device.mac, device.vendor ?? "", device.roles.join(" "), device.probeSsids.join(" "), device.flags.map((flag) => `${flag.title} ${flag.because}`).join(" "), device.ibeacon?.uuid ?? ""].join(" ");
}

function countNew(rows: Observation[], type: string): number {
  return rows.filter((row) => row.event === "new" && row.type === type).length;
}

function rank(flags: Flag[]): number {
  const score = { high: 3, medium: 2, low: 1 };
  return flags.reduce((best, flag) => Math.max(best, score[flag.confidence]), 0);
}

function text(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}
