import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReimbursementEvidencePreview } from "./reimbursement-evidence-preview";

const pdfMocks=vi.hoisted(()=>({destroy:vi.fn(),getPage:vi.fn(),render:vi.fn()}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs",()=>({
  GlobalWorkerOptions:{workerSrc:""},
  getDocument:()=>({promise:Promise.resolve({destroy:pdfMocks.destroy,getPage:pdfMocks.getPage,numPages:2})}),
}));

describe("reimbursement evidence preview",()=>{
  beforeEach(()=>{
    pdfMocks.render.mockReturnValue({promise:Promise.resolve()});
    pdfMocks.getPage.mockResolvedValue({cleanup:vi.fn(),getViewport:({scale}:{scale:number})=>({height:800*scale,width:600*scale}),render:pdfMocks.render});
    vi.spyOn(HTMLCanvasElement.prototype,"toDataURL").mockReturnValue("data:image/png;base64,evidence");
  });
  afterEach(()=>vi.restoreAllMocks());

  it("renders only the selected PDF page and shows navigation for a multi-page file",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,headers:{get:()=>"application/pdf"},arrayBuffer:async()=>new ArrayBuffer(8)}));
    render(<ReimbursementEvidencePreview href="/evidence?id=1" title="카드 승인전표"/>);
    expect(screen.getByRole("status")).toHaveTextContent("준비하고 있어");
    expect(await screen.findByRole("img",{name:"카드 승인전표 첨부 증빙 1페이지"})).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"다음"}));
    await waitFor(()=>expect(screen.getByRole("img",{name:"카드 승인전표 첨부 증빙 2페이지"})).toBeInTheDocument());
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
});
