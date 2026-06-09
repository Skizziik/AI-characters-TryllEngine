import path from "node:path";
import os from "node:os";

/** Where the runtime keeps everything on the user's machine.
 *  Default: %LOCALAPPDATA%\Tryll. Overridable for dev (point at an existing
 *  prebuilt server so nothing has to be downloaded). */
export const INSTALL_DIR =
  process.env.TRYLL_HOME ?? path.join(process.env.LOCALAPPDATA ?? os.homedir(), "Tryll");

export const SERVER_DIR = process.env.TRYLL_SERVER_DIR ?? path.join(INSTALL_DIR, "server");
export const WEIGHTS_DIR = process.env.TRYLL_WEIGHTS_DIR ?? path.join(INSTALL_DIR, "weights");

export const SERVER_EXE = path.join(SERVER_DIR, "tryll_server.exe");
export const LLM_DIR = path.join(WEIGHTS_DIR, "llm");

/** Base URL the components are fetched from (set to our R2 bucket in prod). */
export const CDN_BASE = process.env.TRYLL_CDN ?? "https://cdn.tryllengine.com/stack";
