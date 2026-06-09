import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SERVER_DIR, SERVER_EXE, WEIGHTS_DIR, LLM_DIR, CDN_BASE } from "./paths.ts";

export interface InstallProgress {
  component: "server" | "models";
  progress: number; // 0..1
  detail: string;
}

const GB = 1e9;

async function downloadAndExtract(
  url: string,
  destDir: string,
  component: InstallProgress["component"],
  onProgress: (p: InstallProgress) => void,
) {
  await fsp.mkdir(destDir, { recursive: true });
  const tmp = path.join(destDir, `.dl-${component}.zip`);

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download ${component} failed: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length") ?? 0);

  let received = 0;
  const file = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    file.write(Buffer.from(value));
    received += value.length;
    onProgress({
      component,
      progress: total ? received / total : 0,
      detail: `${(received / GB).toFixed(2)}${total ? ` / ${(total / GB).toFixed(2)}` : ""} GB`,
    });
  }
  await new Promise<void>((r) => file.end(() => r()));

  onProgress({ component, progress: 0.99, detail: "Extracting…" });
  // Windows 10+ ships bsdtar (can extract .zip).
  const r = spawnSync("tar", ["-xf", tmp, "-C", destDir], { windowsHide: true });
  if (r.status !== 0) throw new Error(`extract ${component} failed`);
  await fsp.rm(tmp, { force: true });
  onProgress({ component, progress: 1, detail: "ready" });
}

/** Ensure the server binary + model weights are present, downloading whatever is
 *  missing from the CDN and reporting progress. When everything is already on
 *  disk (e.g. dev with TRYLL_SERVER_DIR pointing at a prebuilt server) it returns
 *  instantly with 100%. */
export async function ensureComponents(onProgress: (p: InstallProgress) => void) {
  if (fs.existsSync(SERVER_EXE)) {
    onProgress({ component: "server", progress: 1, detail: "ready" });
  } else {
    await downloadAndExtract(`${CDN_BASE}/server.zip`, SERVER_DIR, "server", onProgress);
  }

  if (fs.existsSync(LLM_DIR)) {
    onProgress({ component: "models", progress: 1, detail: "ready" });
  } else {
    await downloadAndExtract(`${CDN_BASE}/weights.zip`, WEIGHTS_DIR, "models", onProgress);
  }
}

export function componentsReady(): boolean {
  return fs.existsSync(SERVER_EXE) && fs.existsSync(LLM_DIR);
}
