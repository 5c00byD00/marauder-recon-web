import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("GitHub Pages paths", () => {
  it("builds under the project-site base", () => {
    const config = readConfig();
    expect(config).toContain('base: "/marauder-recon-web/"');
    expect(config).not.toContain("base: \"/\"");
  });

  it("precaches relative asset URLs, not site-root paths", () => {
    const root = mkdtempSync(join(tmpdir(), "recon-dist-"));
    roots.push(root);
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "index.html"), "<!doctype html>");
    writeFileSync(join(root, "assets", "index-abc.js"), "console.log(1)");
    writeFileSync(join(root, "sw.js"), "stale");
    const { urls, worker } = runWorker(root);
    expect(urls).toContain("./");
    expect(urls).toContain("./index.html");
    expect(urls).toContain("./assets/index-abc.js");
    expect(urls).not.toContain("./sw.js");
    expect(worker).toContain('"./assets/index-abc.js"');
    expect(worker).not.toContain('"/assets/');
    expect(worker).toContain("marauder-recon-");
    expect(worker).toContain("addEventListener(\"fetch\"");
  });
});

function readConfig(): string {
  return readFileSync(join(process.cwd(), "vite.config.ts"), "utf8");
}

function runWorker(root: string): { urls: string[]; worker: string } {
  const output = execFileSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `import { precacheUrls, renderServiceWorker } from "./scripts/write-sw.mjs";
const urls = precacheUrls(process.argv[1]);
process.stdout.write(JSON.stringify({ urls, worker: renderServiceWorker(urls) }));`,
      root,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(output) as { urls: string[]; worker: string };
}
