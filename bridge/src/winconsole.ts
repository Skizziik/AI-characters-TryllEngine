// Hide our own console window on Windows so the portable exe runs invisibly
// (the user double-clicks it once; no black console box appears).

export function hideConsole() {
  if (process.platform !== "win32") return;
  try {
    // bun:ffi is available inside the compiled bun exe.
    const { dlopen, FFIType } = require("bun:ffi") as typeof import("bun:ffi");
    const kernel32 = dlopen("kernel32.dll", {
      GetConsoleWindow: { args: [], returns: FFIType.ptr },
    });
    const user32 = dlopen("user32.dll", {
      ShowWindow: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
    });
    const hwnd = kernel32.symbols.GetConsoleWindow();
    if (hwnd) user32.symbols.ShowWindow(hwnd, 0); // SW_HIDE
  } catch {
    /* best-effort — if FFI is unavailable, just leave the console */
  }
}
