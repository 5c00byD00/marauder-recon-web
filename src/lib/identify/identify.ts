import { decodeIBeacon, type IBeacon } from "../recon/ibeacon";
import type { RadioContext } from "../recon/types";
import { formatPrefix, isLocallyAdministered, macPrefix, vendorForMac } from "./oui";
import { SIGNATURES, type Confidence, type SignatureRule, type SignatureSource } from "./rules";
import type { Match } from "./rules";

export interface Flag {
  ruleId: string;
  title: string;
  category: SignatureRule["category"];
  confidence: Confidence;
  because: string;
  sources: SignatureSource[];
  evidence: string;
}

export interface DeviceFacts {
  mac: string;
  probeSsids: string[];
  deauthCount: number;
  loggedTypes: string[];
  rawTypes: string[];
  context?: RadioContext;
  recordIbeacon: IBeacon | null;
}

export interface NetworkFacts {
  ssid: string;
  probes: number;
  probers: string[];
}

const BASE_UUID_TAIL = "00001000800000805F9B34FB";

export function flagsForDevice(facts: DeviceFacts): Flag[] {
  const view = deviceView(facts);
  const flags: Flag[] = [];
  for (const rule of SIGNATURES) {
    if (rule.match.kind === "ssid") {
      for (const ssid of view.probeSsids) {
        if (!matchAgainst(rule.match, view, ssid)) continue;
        flags.push(flagFrom(rule, view, ssid, rule.proberBecause ?? rule.because, rule.proberConfidence ?? rule.confidence, "Probe request"));
      }
      for (const ssid of view.announcedSsids) {
        if (!matchAgainst(rule.match, view, ssid)) continue;
        flags.push(flagFrom(rule, view, ssid, rule.because, rule.confidence, "Announced SSID"));
      }
      continue;
    }
    if (!matchAgainst(rule.match, view)) continue;
    flags.push(flagFrom(rule, view, undefined, rule.because, rule.confidence, evidenceFor(rule.match, view)));
  }
  return suppress(flags);
}

export function flagsForNetwork(ssid: string): Flag[] {
  const flags: Flag[] = [];
  const view = deviceView({
    mac: "00:00:00:00:00:00",
    probeSsids: [],
    deauthCount: 0,
    loggedTypes: [],
    rawTypes: [],
    recordIbeacon: null,
  });
  for (const rule of SIGNATURES) {
    if (rule.match.kind !== "ssid") continue;
    if (!matchAgainst(rule.match, view, ssid)) continue;
    flags.push(flagFrom(rule, view, ssid, rule.because, rule.confidence, "Probed SSID"));
  }
  return orderFlags(flags);
}

export function contextIbeacon(context: RadioContext | undefined): IBeacon | null {
  if (!context?.manufacturerData) return null;
  return decodeIBeacon(context.manufacturerData);
}

interface View {
  mac: string;
  prefix: string;
  vendor: string | null;
  local: boolean;
  probeSsids: string[];
  announcedSsids: string[];
  deauthCount: number;
  loggedTypes: Set<string>;
  rawTypes: string[];
  localName?: string;
  companyIds: Set<number>;
  services: Set<string>;
  manufacturerHex: string;
  beaconText: string;
  ibeacon: IBeacon | null;
  ibeaconEvidence: string;
}

function deviceView(facts: DeviceFacts): View {
  const context = facts.context;
  const companyIds = new Set<number>(context?.companyIds ?? []);
  const manufacturer = context?.manufacturerData;
  if (manufacturer && manufacturer.length >= 2) companyIds.add(manufacturer[0] | (manufacturer[1] << 8));
  const fromContext = contextIbeacon(context);
  const ibeacon = facts.recordIbeacon ?? fromContext;
  return {
    mac: facts.mac.toUpperCase(),
    prefix: formatPrefix(macPrefix(facts.mac)),
    vendor: vendorForMac(facts.mac),
    local: isLocallyAdministered(facts.mac),
    probeSsids: facts.probeSsids,
    announcedSsids: context?.announcedSsids ?? [],
    deauthCount: facts.deauthCount,
    loggedTypes: new Set(facts.loggedTypes),
    rawTypes: facts.rawTypes,
    localName: context?.localName,
    companyIds,
    services: new Set((context?.serviceUuids ?? []).map(normalizeUuid)),
    manufacturerHex: manufacturer ? hex(manufacturer) : "",
    beaconText: context?.beaconText ?? "",
    ibeacon,
    ibeaconEvidence: facts.recordIbeacon ? "obs.rlog" : fromContext ? "Manufacturer data" : "",
  };
}

function matchAgainst(match: Match, view: View, ssid?: string): boolean {
  switch (match.kind) {
    case "oui-org":
      return Boolean(view.vendor && new RegExp(match.pattern).test(view.vendor));
    case "oui-prefix": {
      if (!match.allowLocal && view.local) return false;
      const wanted = new Set(match.prefixes.map((prefix) => prefix.replace(/:/g, "").toUpperCase()));
      return wanted.has(macPrefix(view.mac));
    }
    case "ssid":
      return ssid !== undefined && new RegExp(match.pattern, match.flags ?? "").test(ssid);
    case "ble-company":
      return match.ids.some((id) => view.companyIds.has(Number.parseInt(id.replace(/^0x/i, ""), 16)));
    case "ble-service":
      return match.uuids.some((uuid) => view.services.has(normalizeUuid(uuid)));
    case "ble-name":
      return view.localName !== undefined && new RegExp(match.pattern, match.flags ?? "").test(view.localName);
    case "mfg-contains":
      return view.manufacturerHex.includes(match.hex.replace(/\s+/g, "").toUpperCase());
    case "beacon-contains":
      return view.beaconText.includes(match.text);
    case "logged-type":
      return view.loggedTypes.has(match.type);
    case "random-mac":
      return view.local;
    case "deauth-min":
      return view.deauthCount >= match.min;
    case "ibeacon-payload":
      return view.ibeacon !== null;
    case "all":
      return match.of.every((child) => matchAgainst(child, view, ssid));
  }
}

function evidenceFor(match: Match, view: View): string {
  switch (match.kind) {
    case "oui-org":
    case "oui-prefix":
      return "MAC OUI";
    case "ssid":
      return "SSID";
    case "ble-company":
    case "ble-service":
    case "ble-name":
    case "mfg-contains":
      return "BLE advertisement";
    case "beacon-contains":
      return "Beacon body";
    case "logged-type":
      return "obs.rlog";
    case "random-mac":
      return "MAC header";
    case "deauth-min":
      return "Deauth frames";
    case "ibeacon-payload":
      return view.ibeaconEvidence || "Manufacturer data";
    case "all":
      return [...new Set(match.of.map((child) => evidenceFor(child, view)))].join(" + ");
  }
}

function flagFrom(rule: SignatureRule, view: View, ssid: string | undefined, because: string, confidence: Confidence, evidence: string): Flag {
  const matchedService = [...view.services][0] ?? "";
  const company = [...view.companyIds][0];
  const vars: Record<string, string> = {
    prefix: view.prefix,
    org: view.vendor ?? "an organization missing from this MA-L snapshot",
    ssid: ssid ?? "",
    name: view.localName ?? "",
    uuid: view.ibeacon?.uuid ?? "",
    major: view.ibeacon ? String(view.ibeacon.major) : "",
    minor: view.ibeacon ? String(view.ibeacon.minor) : "",
    tx: view.ibeacon ? String(view.ibeacon.txPower) : "",
    service: matchedService,
    company: company === undefined ? "" : `0x${company.toString(16).toUpperCase().padStart(4, "0")}`,
    count: String(view.deauthCount),
    raw: view.rawTypes.join("/") || "i",
  };
  // Prefer the service UUID this rule actually named.
  if (rule.match.kind === "ble-service" || (rule.match.kind === "all" && rule.match.of.some((child) => child.kind === "ble-service"))) {
    const wanted = collectServices(rule.match);
    const hit = wanted.find((uuid) => view.services.has(uuid));
    if (hit) vars.service = hit;
  }
  let text = fill(because, vars);
  if (rule.note) text = `${text} ${rule.note}`;
  return {
    ruleId: rule.id,
    title: rule.title,
    category: rule.category,
    confidence,
    because: text,
    sources: rule.sources,
    evidence,
  };
}

function collectServices(match: Match): string[] {
  if (match.kind === "ble-service") return match.uuids.map(normalizeUuid);
  if (match.kind === "all") return match.of.flatMap(collectServices);
  return [];
}

function suppress(flags: Flag[]): Flag[] {
  const dropped = new Set<string>();
  for (const flag of flags) {
    const rule = SIGNATURES.find((item) => item.id === flag.ruleId);
    for (const id of rule?.suppresses ?? []) dropped.add(id);
  }
  return orderFlags(flags.filter((flag) => !dropped.has(flag.ruleId)));
}

export function orderFlags(flags: Flag[]): Flag[] {
  const rank: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
  return [...flags].sort((left, right) => rank[left.confidence] - rank[right.confidence] || left.title.localeCompare(right.title));
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export function normalizeUuid(uuid: string): string {
  const hex = uuid.replace(/-/g, "").toUpperCase();
  if (hex.length === 32 && hex.startsWith("0000") && hex.slice(8) === BASE_UUID_TAIL) return hex.slice(4, 8);
  if (hex.length === 4) return hex;
  return hex;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
