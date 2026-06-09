import { spawnSync } from "node:child_process";

const TASK_NAME = "TryllRuntime";

/** Register the runtime to start (hidden) at logon, so the user never has to
 *  launch it again after the first run. Idempotent. Windows only. */
export function registerAutostart(exePath: string) {
  if (process.platform !== "win32") return;
  try {
    spawnSync(
      "schtasks",
      ["/Create", "/TN", TASK_NAME, "/TR", `"${exePath}"`, "/SC", "ONLOGON", "/RL", "LIMITED", "/F"],
      { windowsHide: true, stdio: "ignore" },
    );
  } catch {
    /* best-effort */
  }
}

export function isAutostartRegistered(): boolean {
  if (process.platform !== "win32") return false;
  try {
    const r = spawnSync("schtasks", ["/Query", "/TN", TASK_NAME], { windowsHide: true });
    return r.status === 0;
  } catch {
    return false;
  }
}
