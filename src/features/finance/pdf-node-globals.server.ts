export async function ensurePdfNodeGlobals() {
  const globals = globalThis as unknown as {
    DOMMatrix?: unknown;
    ImageData?: unknown;
    Path2D?: unknown;
  };
  if (globals.DOMMatrix && globals.ImageData && globals.Path2D) return;

  const canvas = await import("@napi-rs/canvas");
  globals.DOMMatrix ??= canvas.DOMMatrix;
  globals.ImageData ??= canvas.ImageData;
  globals.Path2D ??= canvas.Path2D;
}
