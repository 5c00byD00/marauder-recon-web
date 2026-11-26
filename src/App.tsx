import { useState, type DragEvent } from "react";
import { zipSync } from "fflate";
import { buildDemoFiles } from "./demo/mission";
import { analysisToJson, analyze } from "./lib/identify/analyze";
import { ingestFiles, type LoadedMission } from "./lib/recon/ingest";
import { missionToJson, observationsToCsv } from "./lib/recon/export";
import { filesFromFileList, filesFromTransfer } from "./ui/files";
import { MissionScreen } from "./ui/MissionScreen";

interface ReadyState {
  missions: LoadedMission[];
  active: number;
  notice: string;
}

export function App() {
  const [ready, setReady] = useState<ReadyState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function openFiles(files: { path: string; data: Uint8Array }[], notice: string) {
    const result = ingestFiles(files);
    if (result.missions.length === 0) {
      setReady(null);
      setError(result.errors.join(" ") || "Nothing in that selection could be read as a mission.");
      return;
    }
    setError(result.errors.join(" "));
    setReady({ missions: result.missions, active: 0, notice });
  }

  async function onList(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      await openFiles(await filesFromFileList(list), "Opened from selected files.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Those files could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await openFiles(await filesFromTransfer(event.dataTransfer), "Opened from the dropped files.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That drop could not be read.");
    } finally {
      setBusy(false);
    }
  }

  function loadDemo() {
    setError("");
    setReady({ missions: ingestFiles(buildDemoFiles()).missions, active: 0, notice: "Synthetic demo. The MACs and coordinates are made up." });
  }

  function downloadDemoZip() {
    const entries: Record<string, Uint8Array> = {};
    for (const file of buildDemoFiles()) entries[file.path] = file.data;
    downloadBytes("m9001.zip", zipSync(entries, { level: 6 }), "application/zip");
  }

  const current = ready?.missions[ready.active];
  const analysis = current ? analyze(current.mission) : null;

  return (
    <>
      <header className="top">
        <div>
          <p className="kicker">On this device</p>
          <h1>Marauder Recon</h1>
          <p className="credit">
            Reads missions from{" "}
            <a href="https://github.com/justcallmekoko/ESP32Marauder" target="_blank" rel="noreferrer">
              ESP32 Marauder
            </a>
          </p>
        </div>
        <p className="privacy">
          Mission files hold uncensored MAC addresses, SSIDs, and GPS. This page reads them only in your browser. Nothing is uploaded, including from the public site.
        </p>
      </header>
      <main>
        <section
          className="drop"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => void onDrop(event)}
        >
          <h2>Open a mission</h2>
          <p>Drop a /recon/m#### folder, the files inside it, or a zip. Choose folder is for desktop browsers.</p>
          <p>
            On a phone, copy the <span className="mono">/recon/m####</span> folder off the Marauder SD card. Android Chrome cannot upload a folder. Zip that folder, or use Choose files and select session.json, obs.rlog, and any probes.rlog, relations.rlog, and pcap beside them.
          </p>
          <div className="actions">
            <label className="button primary">
              Choose files
              <input
                type="file"
                multiple
                onChange={(event) => {
                  void onList(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            <label className="button">
              Choose folder
              <input
                type="file"
                multiple
                onChange={(event) => {
                  void onList(event.target.files);
                  event.target.value = "";
                }}
                {...{ webkitdirectory: "", directory: "" }}
              />
            </label>
            <button type="button" className="button" onClick={loadDemo} disabled={busy}>
              Load demo mission
            </button>
            <button type="button" className="button quiet" onClick={downloadDemoZip}>
              Download demo zip
            </button>
          </div>
          {busy && <p className="fine">Reading files…</p>}
          {error && <p className="error">{error}</p>}
          {ready && <p className="fine">{ready.notice}</p>}
        </section>

        {current && analysis && (
          <>
            {ready && ready.missions.length > 1 && (
              <label className="switcher">
                Mission
                <select value={ready.active} onChange={(event) => setReady({ ...ready, active: Number(event.target.value) })}>
                  {ready.missions.map((mission, index) => (
                    <option key={mission.name + index} value={index}>
                      {mission.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="exports">
              <button type="button" onClick={() => downloadText(`${current.name}-observations.csv`, observationsToCsv(current.mission.observations), "text/csv")}>
                Download observations.csv
              </button>
              <button type="button" onClick={() => downloadText(`${current.name}-mission.json`, missionToJson(current.mission), "application/json")}>
                Download mission.json
              </button>
              <button type="button" onClick={() => downloadText(`${current.name}-identification.json`, analysisToJson(analysis), "application/json")}>
                Download identification.json
              </button>
            </div>
            <MissionScreen loaded={current} analysis={analysis} />
          </>
        )}
      </main>
      <footer className="site-footer">
        <a href="https://github.com/5c00byD00/marauder-recon-web" target="_blank" rel="noreferrer">
          Source
        </a>
      </footer>
    </>
  );
}

function downloadText(name: string, contents: string, mime: string) {
  downloadBytes(name, new TextEncoder().encode(contents), mime);
}

function downloadBytes(name: string, data: Uint8Array, mime: string) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const url = URL.createObjectURL(new Blob([copy], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
