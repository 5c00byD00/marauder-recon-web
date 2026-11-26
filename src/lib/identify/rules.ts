import rawRules from "../../data/signatures.json";

export type Confidence = "high" | "medium" | "low";

export type Category = "alpr" | "camera" | "wearable" | "hacking" | "tracker" | "beacon" | "privacy" | "activity";

export interface SignatureSource {
  title: string;
  url: string;
}

export type Match =
  | { kind: "oui-org"; pattern: string }
  | { kind: "oui-prefix"; prefixes: string[]; allowLocal?: boolean }
  | { kind: "ssid"; pattern: string; flags?: string }
  | { kind: "ble-company"; ids: string[] }
  | { kind: "ble-service"; uuids: string[] }
  | { kind: "ble-name"; pattern: string; flags?: string }
  | { kind: "mfg-contains"; hex: string }
  | { kind: "beacon-contains"; text: string }
  | { kind: "logged-type"; type: string }
  | { kind: "random-mac" }
  | { kind: "deauth-min"; min: number }
  | { kind: "ibeacon-payload" }
  | { kind: "all"; of: Match[] };

export interface SignatureRule {
  id: string;
  title: string;
  category: Category;
  confidence: Confidence;
  match: Match;
  because: string;
  proberBecause?: string;
  proberConfidence?: Confidence;
  note?: string;
  suppresses?: string[];
  sources: SignatureSource[];
}

const CATEGORIES = new Set<Category>(["alpr", "camera", "wearable", "hacking", "tracker", "beacon", "privacy", "activity"]);
const CONFIDENCE = new Set<Confidence>(["high", "medium", "low"]);

export const SIGNATURES: SignatureRule[] = validate(rawRules);

function validate(input: unknown): SignatureRule[] {
  if (!Array.isArray(input)) throw new Error("signatures.json must be an array");
  const ids = new Set<string>();
  return input.map((entry) => {
    const rule = entry as SignatureRule;
    if (!rule.id || ids.has(rule.id)) throw new Error(`Bad or duplicate signature id ${rule.id}`);
    ids.add(rule.id);
    if (!CATEGORIES.has(rule.category)) throw new Error(`${rule.id} has a bad category`);
    if (!CONFIDENCE.has(rule.confidence)) throw new Error(`${rule.id} has a bad confidence`);
    if (!rule.because || !Array.isArray(rule.sources) || rule.sources.length === 0) {
      throw new Error(`${rule.id} is missing because or sources`);
    }
    for (const source of rule.sources) {
      if (!source.title || !source.url.startsWith("https://")) throw new Error(`${rule.id} has a bad source`);
    }
    compile(rule.match, rule.id);
    if (rule.match.kind === "ssid" && (!rule.proberBecause || !rule.proberConfidence)) {
      throw new Error(`${rule.id} is an SSID rule without a prober explanation`);
    }
    return rule;
  });
}

function compile(match: Match, id: string): void {
  if (match.kind === "oui-org" || match.kind === "ssid" || match.kind === "ble-name") {
    new RegExp(match.kind === "oui-org" ? match.pattern : match.pattern, match.kind === "oui-org" ? "" : match.flags ?? "");
    return;
  }
  if (match.kind === "all") {
    if (match.of.length === 0) throw new Error(`${id} has an empty all-match`);
    match.of.forEach((child) => compile(child, id));
  }
}
