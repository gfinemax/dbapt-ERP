import { beforeEach, describe, expect, it, vi } from "vitest";

import { fixedCertificateReferenceSource, loadFixedCertificateReferenceNames } from "./fixed-certificate-assignment-source";

beforeEach(() => vi.restoreAllMocks());

describe("fixed certificate reference source", () => {
  it("reads only the 116-name range and returns numbered, hashed rows", async () => {
    const names = Array.from({ length: 116 }, (_, index) => `조합원${index + 1}`);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(names.map((name) => `"${name}"`).join("\n")));

    const result = await loadFixedCertificateReferenceNames();

    expect(result.names).toHaveLength(116);
    expect(result.names[0]).toEqual({ row_number: 4, name: "조합원1" });
    expect(result.names[115]).toEqual({ row_number: 119, name: "조합원116" });
    expect(result.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requested.pathname).toContain(fixedCertificateReferenceSource.documentId);
    expect(requested.searchParams.get("gid")).toBe("72846910");
    expect(requested.searchParams.get("range")).toBe("B4:B119");
  });

  it("rejects duplicate or incomplete source lists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(Array.from({ length: 116 }, () => '"같은이름"').join("\n")));
    await expect(loadFixedCertificateReferenceNames()).rejects.toThrow("중복 이름");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('"한명"'));
    await expect(loadFixedCertificateReferenceNames()).rejects.toThrow("정확히 116명");
  });
});
