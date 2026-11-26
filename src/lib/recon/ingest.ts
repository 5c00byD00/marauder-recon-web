import { unzipSync } from "fflate";
import { parseMission, parseRadioContext } from "./parse";
import type { Mission } from "./types";

export interface IngestFile {
  path: string;
  data: Uint8Array;
}

export interface LoadedMission {
  name: string;
  mission: Mission;
  paths: string[];
  pcap: string[];
}

export interface IngestResult {
  missions: LoadedMission[];
  errors: string[];
}

const TEXT = new TextDecoder("utf-8", { fatal: false });
const MAX_UNZIPPED = 80 * 1024 * 1024;

export function ingestFiles(files: IngestFile[]): IngestResult {
  const normalized = files
    .map((file) => ({ path: normalizePath(file.path), data: file.data }))
    .filter((file) => file.path && !file.path.split("/").some((part) => part === ".." || part === "__MACOSX" || part === ".DS_Store"));

  const sessions = normalized.filter((file) => basename(file.path).toLowerCase() === "session.json");
  if (sessions.length === 0) {
    return { missions: [], errors: ["No session.json found. Choose the mission folder, its files, or a zip of that folder."] };
  }

  const missions: LoadedMission[] = [];
  const errors: string[] = [];
  for (const session of sessions) {
    const directory = parentPath(session.path);
    const siblings = normalized.filter((file) => parentPath(file.path) === directory);
    const loaded = loadOne(directory, session, siblings);
    if (loaded.ok) missions.push(loaded.mission);
    else errors.push(loaded.error);
  }
  return { missions, errors };
}

export function filesFromZip(bytes: Uint8Array): IngestFile[] {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("That zip could not be read.");
  }
  let total = 0;
  const files: IngestFile[] = [];
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith("/")) continue;
    total += data.length;
    if (total > MAX_UNZIPPED) throw new Error("That zip expands past 80 MB, so it was not opened.");
    files.push({ path, data });
  }
  return files;
}

function loadOne(
  directory: string,
  session: IngestFile,
  siblings: IngestFile[],
): { ok: true; mission: LoadedMission } | { ok: false; error: string } {
  const name = directory ? basename(directory) : "mission";
  let manifest: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(TEXT.decode(session.data));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: `${name}: session.json must be a JSON object` };
    }
    manifest = parsed as Record<string, unknown>;
  } catch (error) {
    return { ok: false, error: `${name}: invalid session.json (${error instanceof Error ? error.message : String(error)})` };
  }

  const obsName = typeof manifest.observations === "string" ? manifest.observations : "obs.rlog";
  const probeName = typeof manifest.probes === "string" ? manifest.probes : "probes.rlog";
  const relName = typeof manifest.relationships === "string" ? manifest.relationships : "relations.rlog";
  const observations = findSibling(siblings, obsName);
  if (!observations) return { ok: false, error: `${name}: missing ${obsName}` };

  const probes = findSibling(siblings, probeName);
  const relationships = findSibling(siblings, relName);
  const contextFile = siblings.find((file) => basename(file.path).toLowerCase() === "radio-context.json");
  let contexts = undefined;
  if (contextFile) {
    const parsed = parseRadioContext(TEXT.decode(contextFile.data));
    if (parsed.error) return { ok: false, error: `${name}: ${parsed.error}` };
    contexts = parsed.contexts;
  }

  const parsed = parseMission({
    sessionJson: TEXT.decode(session.data),
    observations: observations.data,
    probes: probes?.data,
    relationships: relationships?.data,
    contexts,
  });
  if (!parsed.ok) return { ok: false, error: `${name}: ${parsed.error}` };

  const capture = typeof manifest.capture === "string" ? manifest.capture : "";
  const pcap = siblings
    .filter((file) => {
      const base = basename(file.path).toLowerCase();
      return base.endsWith(".pcap") || base.endsWith(".pcapng") || (capture !== "" && base === capture.toLowerCase());
    })
    .map((file) => basename(file.path));

  return {
    ok: true,
    mission: {
      name,
      mission: parsed.mission,
      paths: siblings.map((file) => file.path),
      pcap,
    },
  };
}

function findSibling(files: IngestFile[], name: string): IngestFile | undefined {
  const exact = files.find((file) => basename(file.path) === name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  return files.find((file) => basename(file.path).toLowerCase() === lower);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+/g, "/");
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function parentPath(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}
