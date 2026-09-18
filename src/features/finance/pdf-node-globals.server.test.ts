import { afterEach, describe, expect, it } from "vitest";
import { ensurePdfNodeGlobals } from "./pdf-node-globals.server";

const globals = globalThis as unknown as Record<"DOMMatrix" | "ImageData" | "Path2D", unknown>;
const originalGlobals = {
  DOMMatrix: globals.DOMMatrix,
  ImageData: globals.ImageData,
  Path2D: globals.Path2D,
};

describe("PDF Node globals", () => {
  afterEach(() => {
    for (const [name, value] of Object.entries(originalGlobals)) {
      if (value === undefined) Reflect.deleteProperty(globals, name);
      else globals[name as keyof typeof originalGlobals] = value;
    }
  });

  it("installs the canvas globals required by pdf.js", async () => {
    Reflect.deleteProperty(globals, "DOMMatrix");
    Reflect.deleteProperty(globals, "ImageData");
    Reflect.deleteProperty(globals, "Path2D");

    await ensurePdfNodeGlobals();

    expect(globals.DOMMatrix).toBeTypeOf("function");
    expect(globals.ImageData).toBeTypeOf("function");
    expect(globals.Path2D).toBeTypeOf("function");
  });
});
