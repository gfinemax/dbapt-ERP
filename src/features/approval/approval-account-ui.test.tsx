import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ApprovalListPage } from "./approval-list-page";
import { ApprovalDecisionForm } from "./approval-decision-form";
import { ApprovalCommandForm } from "./approval-command-form";
import { ApprovalMutationFields } from "./approval-mutation-fields";
import type { ApprovalDocument } from "./approval-domain";
import type { ReimbursementMember } from "@/features/finance/reimbursement-domain";
const decide = vi.fn();
vi.mock("@/components/erp-shell", () => ({ErpShell:({children}:{children:React.ReactNode})=><>{children}</>}));
vi.mock("@/app/approval/actions", () => ({decideApprovalAction:(...args:unknown[])=>decide(...args)}));
const viewer:ReimbursementMember={user_id:"u1",organization_id:"org",display_name:"같은 이름",permissions:["APPROVE"],active:true};
const base = {id:"doc1",title:"내 원본",documentNo:"기안-1",documentType:"GENERAL",drafterLabel:"같은 이름",amount:1,approvalStatus:"IN_REVIEW",meetingStatus:"NOT_REQUIRED",executionStatus:"NOT_LINKED",updatedAt:"2026-09-08",approvalSteps:[{order:1,approverLabel:"같은 이름",approverRole:"담당",status:"PENDING"}],authorization:{drafter_user_id:"u1",version:3,steps:[{order:1,user_id:"u1",legacy_step:{step_id:"step",approver_label:"같은 이름",approver_role:"담당"}}]}} as ApprovalDocument;
describe("approval account UI",()=>{
 it("filters mine and pending by UUID despite matching display names",()=>{
  render(<ApprovalListPage viewer={viewer} documents={[base,{...base,id:"doc2",title:"다른 사람 원본",authorization:{...base.authorization!,drafter_user_id:"u2",steps:[{...base.authorization!.steps[0],user_id:"u2"}]}}]} />);
  expect(screen.getByText("다른 사람 원본")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"내 문서"}));expect(screen.getByText("내 원본")).toBeInTheDocument();expect(screen.queryByText("다른 사람 원본")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"결재할 문서"}));expect(screen.queryByText("다른 사람 원본")).not.toBeInTheDocument();
 });
 it("keeps actor readonly and sends displayed version and stable operation key",async()=>{
  decide.mockResolvedValue({error:"다시 확인"});
  const {container}=render(<ApprovalDecisionForm documentId="doc1" approverLabel="실제 계정" expectedVersion={3}/>);
  expect(screen.getByLabelText("처리자")).toHaveAttribute("readonly");
  const key=container.querySelector<HTMLInputElement>('[name="operationKey"]')!.value;
  fireEvent.click(screen.getByRole("button",{name:"승인"}));await screen.findByRole("alert");
  const data=decide.mock.calls.at(-1)![1] as FormData;expect(data.get("expectedVersion")).toBe("3");expect(data.get("operationKey")).toBe(key);expect(data.get("actorLabel")).toBe("실제 계정");
 });
 it("preserves fields and retry key after a command error and prevents double submit",async()=>{
  let reject!:(error:Error)=>void;const action=vi.fn(()=>new Promise<void>((_resolve,no)=>{reject=no;}));
  const {container}=render(<ApprovalCommandForm action={action}><ApprovalMutationFields version={2}/><input aria-label="수정 제목" name="title" defaultValue="원본"/><button>저장</button></ApprovalCommandForm>);
  fireEvent.change(screen.getByLabelText("수정 제목"),{target:{value:"수정 입력"}});const key=container.querySelector<HTMLInputElement>('[name="operationKey"]')!.value;
  fireEvent.click(screen.getByRole("button",{name:"저장"}));fireEvent.click(screen.getByRole("button",{name:"저장"}));await waitFor(()=>expect(action).toHaveBeenCalledTimes(1));reject(new Error("다른 사용자가 변경했어"));
  expect(await screen.findByRole("alert")).toHaveTextContent("다른 사용자가 변경했어");expect(screen.getByLabelText("수정 제목")).toHaveValue("수정 입력");expect(container.querySelector('[name="operationKey"]')).toHaveValue(key);
 });
});
