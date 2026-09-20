import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks=vi.hoisted(()=>({evidence:vi.fn()}));
vi.mock("../actions",()=>({reimbursementEvidence:mocks.evidence}));

describe("reimbursement evidence route",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.evidence.mockResolvedValue("https://storage.example/evidence.pdf");});
  afterEach(()=>vi.unstubAllGlobals());

  it("streams an authorized PDF inline without exposing its signed location",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("%PDF-evidence",{headers:{"content-type":"application/pdf","content-length":"13"}})));
    const response=await GET(new Request("https://erp.example/finance/reimbursements/evidence?id=request-1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("%PDF-evidence");
  });

  it("rejects unsupported upstream content",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("<html>",{headers:{"content-type":"text/html"}})));
    const response=await GET(new Request("https://erp.example/finance/reimbursements/evidence?id=request-1"));
    expect(response.status).toBe(403);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
