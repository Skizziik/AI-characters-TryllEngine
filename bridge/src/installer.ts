import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SERVER_DIR, SERVER_EXE, CDN_BASE } from "./paths.ts";

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

/** Ensure the server BINARY is present, downloading server.zip from the CDN if
 *  missing (with progress). The model itself is fetched separately by the server
 *  from HuggingFace during /setup. Instant when the binary is already on disk. */
export async function ensureServer(onProgress: (p: InstallProgress) => void) {
  if (fs.existsSync(SERVER_EXE)) {
    onProgress({ component: "server", progress: 1, detail: "ready" });
  } else {
    await downloadAndExtract(`${CDN_BASE}/server.zip`, SERVER_DIR, "server", onProgress);
  }
}

export function serverReady(): boolean {
  return fs.existsSync(SERVER_EXE);
}
