import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { ReimbursementLogin, ReimbursementPage } from "./reimbursement-page";
import type { ReimbursementWorkspace } from "./reimbursement-repository";
const mocks=vi.hoisted(()=>({analyze:vi.fn(),command:vi.fn(),personalUpdate:vi.fn(),policy:vi.fn(),login:vi.fn(),refresh:vi.fn(),push:vi.fn(),submit:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh,push:mocks.push})}));
vi.mock("@/app/finance/reimbursements/actions",()=>({analyzeReimbursementEvidence:mocks.analyze,runReimbursementCommand:mocks.command,saveReimbursementPolicy:mocks.policy,reimbursementLogin:mocks.login,reimbursementLogout:vi.fn(),submitReimbursement:mocks.submit,reimbursementEvidence:vi.fn(),saveReimbursementMember:vi.fn(),changeReimbursementPassword:vi.fn()}));
vi.mock("@/app/finance/expenses/actions",()=>({updatePersonalReimbursementDetailsAction:mocks.personalUpdate}));
const w:ReimbursementWorkspace={month:"2026-03-01",member:{user_id:"a",organization_id:"o",display_name:"관리자",permissions:["ADMIN"],active:true},members:[],policy:null,periods:[{month:"2026-03-01",status:"CLOSED",submission_deadline:"2026-04-05",completion_deadline:"2026-04-10",long_delay_days:60,revision:1}],requests:[{id:"r",applicant_id:"b",budget_id:"budget",used_on:"2026-03-15",budget_month:"2026-03-01",amount:80000,merchant:"문구점",purpose:"사무용품",delay_reason:"영수증 누락",source_quick_id:null,status:"APPROVED",needs_exception:true,needs_senior:false,exception_approved_at:"2026-06-01",senior_approved_at:null,over_budget_approved_at:null,submitted_at:"2026-06-01",approved_at:"2026-06-02",paid_at:null,bank_transaction_id:null}],budgets:[],reports:[],audits:[],banks:[{id:"bank",transacted_at:"2026-06-15T12:00:00+09:00",withdrawal_amount:80000,counterparty:"신청자",description:"정산"}],sources:[]};
describe("reimbursement workspace",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("opens a deep-linked approval only when the current actor may approve it",()=>{
  const request={...w.requests[0],status:"SUBMITTED" as const,needs_exception:false,approved_at:null};
  render(<ReimbursementPage workspace={{...w,requests:[request]}} initialRequestId="r" initialAction="APPROVE"/>);
  expect(screen.getByRole("dialog",{name:"예산 반영 승인"})).toBeInTheDocument();
  expect(document.getElementById("reimbursement-request-r")).toHaveClass("border-blue-400");
 });
 it("does not open a deep-linked approval for the applicant's own request",()=>{
  const request={...w.requests[0],applicant_id:"a",status:"SUBMITTED" as const,needs_exception:false,approved_at:null};
  render(<ReimbursementPage workspace={{...w,requests:[request]}} initialRequestId="r" initialAction="APPROVE"/>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.getElementById("reimbursement-request-r")).toHaveClass("border-blue-400");
 });
 it("opens a deep-linked payment only after approval for a payment operator",()=>{
  render(<ReimbursementPage workspace={w} initialRequestId="r" initialAction="PAY"/>);
  expect(screen.getByRole("dialog",{name:"지급 연결"})).toBeInTheDocument();
 });
 it("passes a bank ID rather than a backdated payment date and refreshes after saving",async()=>{
  mocks.command.mockResolvedValue({}); render(<ReimbursementPage workspace={w}/>);
  fireEvent.click(screen.getByRole("button",{name:"지급 연결"}));
  fireEvent.change(screen.getByRole("combobox",{name:/실제 출금거래/}),{target:{value:"bank"}});
  fireEvent.change(screen.getByRole("textbox",{name:"처리 사유"}),{target:{value:"이체 확인"}});
  fireEvent.click(screen.getByRole("button",{name:"확인·처리"}));
  await waitFor(()=>expect(mocks.command).toHaveBeenCalledWith("PAY",{id:"r",reason:"이체 확인",bank_transaction_id:"bank"}));
  expect(mocks.refresh).toHaveBeenCalled();
 });
 it("keeps the dialog and entered reason on persistence failure",async()=>{
  mocks.command.mockRejectedValue(new Error("이미 연결된 출금거래")); render(<ReimbursementPage workspace={w}/>);
  fireEvent.click(screen.getByRole("button",{name:"신청 취소"}));
  fireEvent.change(screen.getByRole("textbox",{name:"처리 사유"}),{target:{value:"중복 확인"}});
  fireEvent.click(screen.getByRole("button",{name:"확인·처리"}));
  await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("이미 연결된 출금거래"));
  expect(screen.getByRole("textbox",{name:"처리 사유"})).toHaveValue("중복 확인"); expect(mocks.refresh).not.toHaveBeenCalled();
 });
 it("does not invent deadline defaults",()=>{
  render(<ReimbursementPage workspace={w}/>);fireEvent.click(screen.getByRole("button",{name:"운영 기준·권한"}));
  expect(screen.getByRole("spinbutton",{name:"다음 달 제출 마감일"})).toHaveValue(null);
 });
 it("allows the first request to auto-open its usage month when policy exists",()=>{
  render(<ReimbursementPage workspace={{...w,periods:[],policy:{submission_day:5,completion_day:10,long_delay_days:60}}}/>);
  expect(screen.getByText(/접수월은 신청과 함께 자동 개설돼/)).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"내용 확인 후 정산 신청"})).toBeEnabled();
 });
 it("shows the request and its evidence together in a detail dialog",()=>{
  render(<ReimbursementPage workspace={w}/>);
  fireEvent.click(screen.getByRole("button",{name:"상세 보기"}));
  const dialog=screen.getByRole("dialog",{name:"문구점 · 80,000원"});
  expect(dialog).toHaveTextContent("신청 내용");
  expect(dialog).toHaveTextContent("사무용품");
  expect(dialog).toHaveTextContent("처리 정보");
  expect(screen.getByTitle("문구점 첨부 증빙")).toHaveAttribute("src","/finance/reimbursements/evidence?id=r");
  expect(screen.getByRole("link",{name:"새 창에서 열기"})).toHaveAttribute("href","/finance/reimbursements/evidence?id=r");
  fireEvent.click(screen.getByRole("button",{name:"정산 상세 닫기"}));
  expect(screen.queryByRole("dialog",{name:"문구점 · 80,000원"})).not.toBeInTheDocument();
 });
 it("edits a submitted request from the detail dialog and records the reason",async()=>{
  mocks.personalUpdate.mockResolvedValue({ok:true,message:"수정했어."});
  const request={...w.requests[0],applicant_id:"a",status:"SUBMITTED" as const,approved_at:null,updated_at:"2026-09-20T00:00:00Z"};
  render(<ReimbursementPage workspace={{...w,requests:[request]}}/>);
  fireEvent.click(screen.getByRole("button",{name:"상세 보기"}));
  fireEvent.click(screen.getByRole("button",{name:"거래처·사용내용 수정"}));
  fireEvent.change(screen.getByLabelText("거래처"),{target:{value:"새 문구점"}});
  fireEvent.change(screen.getByLabelText("사용내용"),{target:{value:"복사용지 구매"}});
  fireEvent.change(screen.getByLabelText("수정 사유"),{target:{value:"OCR 상호 오기"}});
  fireEvent.click(screen.getByRole("button",{name:"수정 저장"}));
  await waitFor(()=>expect(mocks.personalUpdate).toHaveBeenCalledWith({id:"r",merchant:"새 문구점",purpose:"복사용지 구매",reason:"OCR 상호 오기",expectedUpdatedAt:"2026-09-20T00:00:00Z"}));
  expect(mocks.refresh).toHaveBeenCalled();
  expect(screen.queryByRole("dialog",{name:/새 문구점|문구점/})).not.toBeInTheDocument();
 });
 it("opens the personal reimbursement form when the request tab is clicked",()=>{
  render(<ReimbursementPage workspace={w}/>);
  const details=screen.getByText("개인 지출 정산 신청").closest("details");
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button",{name:"정산 신청·처리"}));
  expect(details).toHaveAttribute("open");
  fireEvent.click(screen.getByText("개인 지출 정산 신청"));
  expect(details).not.toHaveAttribute("open");
 });
 it("blocks automatic period creation only when the operating policy is missing",()=>{
  render(<ReimbursementPage workspace={{...w,periods:[],policy:null}}/>);
  expect(screen.getByText("접수월 자동 개설에 필요한 운영 기준을 관리자가 먼저 저장해야 해.")).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"내용 확인 후 정산 신청"})).toBeDisabled();
 });
 it("starts with receipt OCR and applies only recognized reimbursement facts",async()=>{
  mocks.analyze.mockResolvedValue({ocrData:{documentDate:"2026-03-14",issuer:"우정사업본부(우체국)",items:[{itemName:"우편요금"}],normalizedEvidenceType:"영수증",totalAmount:1770}});
  render(<ReimbursementPage workspace={{...w,budgets:[{id:"budget",budget_item:"일반운영비>도서인쇄비",approved_amount:1000000,monthly_amount:100000,annual_recorded_amount:0,quick_amount:0,personal_amount:0,unpaid_amount:0,reserved_amount:0}]}}/>);
  expect(screen.getByRole("button",{name:"영수증으로 정산"})).toHaveAttribute("aria-pressed","true");
  fireEvent.change(screen.getByLabelText(/^영수증 파일/),{target:{files:[new File([new Uint8Array([255,216,255])],"receipt.jpg",{type:"image/jpeg"})]}});
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("OCR 분석 완료"));
  expect(screen.getByLabelText("실제 사용일")).toHaveValue("2026-03-14");
  expect(screen.getByLabelText("개인 결제 금액")).toHaveValue(1770);
  expect(screen.getByLabelText("사용처")).toHaveValue("우정사업본부(우체국)");
  expect(screen.getByLabelText("업무 목적")).toHaveValue("우편요금 구입");
  expect(screen.getByLabelText("예산항목")).toHaveValue("budget");
 });
 it("opens the receipt picker from the receipt mode button",()=>{
  render(<ReimbursementPage workspace={w}/>);
  const fileInput=screen.getByLabelText("영수증 파일");
  const click=vi.spyOn(fileInput,"click");
  fireEvent.click(screen.getByRole("button",{name:"영수증으로 정산"}));
  expect(click).toHaveBeenCalledOnce();
 });
 it("accepts a dropped receipt, shows OCR completion, and keeps every OCR field editable",async()=>{
  mocks.analyze.mockResolvedValue({ocrData:{documentDate:"2026-03-14",issuer:"우정사업본부(우체국)",recognizedText:"우편요금",totalAmount:1770}});
  const budgets=[{id:"printing",budget_item:"일반운영비>도서인쇄비",approved_amount:1000000,monthly_amount:100000,annual_recorded_amount:0,quick_amount:0,personal_amount:0,unpaid_amount:0,reserved_amount:0}];
  render(<ReimbursementPage workspace={{...w,budgets}}/>);
  const file=new File([new Uint8Array([255,216,255])],"postal-receipt.jpg",{type:"image/jpeg"});
  fireEvent.drop(screen.getByRole("button",{name:"영수증을 끌어놓거나 클릭해서 선택"}),{dataTransfer:{files:[file]}});
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("OCR 분석 완료"));
  expect(screen.getByRole("status")).toHaveTextContent("자동입력된 값도 아래에서 수정할 수 있어");
  fireEvent.change(screen.getByLabelText("개인 결제 금액"),{target:{value:"1800"}});
  fireEvent.change(screen.getByLabelText("사용처"),{target:{value:"직접 확인한 우체국"}});
  fireEvent.change(screen.getByLabelText("업무 목적"),{target:{value:"등기우편 발송"}});
  expect(screen.getByLabelText("개인 결제 금액")).toHaveValue(1800);
  expect(screen.getByLabelText("사용처")).toHaveValue("직접 확인한 우체국");
  expect(screen.getByLabelText("업무 목적")).toHaveValue("등기우편 발송");
  expect(screen.getByLabelText("예산항목")).toHaveValue("printing");
  const form=screen.getByRole("button",{name:"내용 확인 후 정산 신청"}).closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
  await waitFor(()=>expect(mocks.submit).toHaveBeenCalled());
  expect((mocks.submit.mock.calls[0][0] as FormData).get("evidence")).toMatchObject({name:"postal-receipt.jpg",type:"image/jpeg",size:3});
 });
 it("uses a clearly separated exception path when the receipt is missing",()=>{
  render(<ReimbursementPage workspace={w}/>);
  fireEvent.click(screen.getByRole("button",{name:"영수증 없음·예외 접수"}));
  expect(screen.getByText("2. 예외 지출 내용 직접 입력")).toBeInTheDocument();
  expect(screen.getByLabelText("제출 증빙 종류")).toHaveValue("OTHER_ALTERNATIVE");
  expect(screen.getByRole("option",{name:"영수증"})).toBeDisabled();
  expect(screen.getByLabelText("영수증 미첨부 사유")).toBeRequired();
 });
 it("makes a replacement file optional when an existing expense is linked",()=>{
  render(<ReimbursementPage workspace={{...w,sources:[{id:"quick",occurred_at:"2026-03-15T12:00:00+09:00",amount:20000,counterparty:"문구점",budget_item:"사무용품",usage_description:"페인트 용품"}]}}/>);
  fireEvent.click(screen.getByRole("button",{name:"기존 지출 불러오기"}));
  fireEvent.change(screen.getByLabelText(/^기존 개인 선지출/),{target:{value:"quick"}});
  expect(screen.getByLabelText(/^새 증빙 파일 \(선택\)/)).not.toBeRequired();
  expect(screen.getByLabelText("개인 결제 금액")).toHaveValue(20000);
  expect(screen.getByLabelText("사용처")).toHaveValue("문구점");
 });
 it("does not overwrite values edited while OCR is running",async()=>{
  let finish:(value:{ocrData:{issuer:string;totalAmount:number}})=>void=()=>{};
  mocks.analyze.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  render(<ReimbursementPage workspace={w}/>);
  fireEvent.change(screen.getByLabelText("영수증 파일"),{target:{files:[new File([new Uint8Array([255,216,255])],"receipt.jpg",{type:"image/jpeg"})]}});
  fireEvent.change(screen.getByLabelText("개인 결제 금액"),{target:{value:"41000"}});
  fireEvent.change(screen.getByLabelText("사용처"),{target:{value:"직접 확인한 상호"}});
  finish({ocrData:{issuer:"OCR 상호",totalAmount:32600}});
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("OCR 분석 완료"));
  expect(screen.getByLabelText("개인 결제 금액")).toHaveValue(41000);
  expect(screen.getByLabelText("사용처")).toHaveValue("직접 확인한 상호");
 });
 it("does not overwrite a budget item selected while OCR is running",async()=>{
  let finish:(value:{ocrData:{issuer:string;recognizedText:string;totalAmount:number}})=>void=()=>{};
  mocks.analyze.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const budgets=[
    {id:"printing",budget_item:"일반운영비>도서인쇄비",approved_amount:1000000,monthly_amount:100000,annual_recorded_amount:0,quick_amount:0,personal_amount:0,unpaid_amount:0,reserved_amount:0},
    {id:"supplies",budget_item:"일반운영비>사무용품비",approved_amount:1000000,monthly_amount:100000,annual_recorded_amount:0,quick_amount:0,personal_amount:0,unpaid_amount:0,reserved_amount:0},
  ];
  render(<ReimbursementPage workspace={{...w,budgets}}/>);
  fireEvent.change(screen.getByLabelText("영수증 파일"),{target:{files:[new File([new Uint8Array([255,216,255])],"receipt.jpg",{type:"image/jpeg"})]}});
  fireEvent.change(screen.getByLabelText("예산항목"),{target:{value:"supplies"}});
  finish({ocrData:{issuer:"우정사업본부(우체국)",recognizedText:"우편요금",totalAmount:1770}});
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("OCR 분석 완료"));
  expect(screen.getByLabelText("예산항목")).toHaveValue("supplies");
 });
 it("shows a specific policy validation error instead of a production server digest",async()=>{
  mocks.policy.mockResolvedValue({ok:false,message:"보완 마감일은 제출 마감일과 같거나 늦은 1일부터 28일 사이여야 해."});
  render(<ReimbursementPage workspace={w} initialTab="settings"/>);
  fireEvent.change(screen.getByRole("spinbutton",{name:"다음 달 제출 마감일"}),{target:{value:"10"}});
  fireEvent.change(screen.getByRole("spinbutton",{name:"다음 달 보완 마감일"}),{target:{value:"5"}});
  fireEvent.change(screen.getByRole("spinbutton",{name:"장기 지연 기준 \(사용 후 일수\)"}),{target:{value:"60"}});
  fireEvent.click(screen.getByRole("button",{name:"기준 저장"}));
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("보완 마감일은 제출 마감일과 같거나 늦은 1일부터 28일 사이여야 해."));
 });
});
describe("reimbursement login",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("shows the safe authentication result instead of a production server digest",async()=>{
  mocks.login.mockResolvedValue({ok:false,message:"이메일 또는 비밀번호가 올바르지 않아."});
  render(<ReimbursementLogin/>);
  fireEvent.change(screen.getByRole("textbox",{name:"이메일"}),{target:{value:"user@example.com"}});
  fireEvent.change(screen.getByLabelText("비밀번호"),{target:{value:"wrong-password"}});
  fireEvent.click(screen.getByRole("button",{name:"로그인"}));
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("이메일 또는 비밀번호가 올바르지 않아."));
  expect(mocks.refresh).not.toHaveBeenCalled();
 });
 it("refreshes only after a successful authenticated and authorized login",async()=>{
  mocks.login.mockResolvedValue({ok:true,message:"로그인했어."});
  render(<ReimbursementLogin/>);
  fireEvent.change(screen.getByRole("textbox",{name:"이메일"}),{target:{value:"user@example.com"}});
  fireEvent.change(screen.getByLabelText("비밀번호"),{target:{value:"valid-password"}});
  fireEvent.click(screen.getByRole("button",{name:"로그인"}));
  await waitFor(()=>expect(mocks.refresh).toHaveBeenCalled());
  expect(screen.getByRole("status")).toHaveTextContent("로그인했어.");
 });
});
