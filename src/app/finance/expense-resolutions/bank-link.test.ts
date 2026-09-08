import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({access:vi.fn(),related:vi.fn(),upsert:vi.fn(),single:vi.fn()}));
vi.mock("@/features/finance/expense-authorization",()=>({requireExpenseRecord:mocks.access,assertExpenseRelatedRow:mocks.related}));
vi.mock("@/features/finance/expense-resolution-repository",()=>({upsertExpenseResolutionInSupabase:mocks.upsert}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseServerClient:()=>({schema:()=>({from:()=>({select:()=>({eq:()=>({eq:()=>({single:mocks.single})})})})})})}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("@/features/finance/expense-evidence-ocr.server",()=>({extractExpenseEvidenceFile:vi.fn()}));
vi.mock("@/features/finance/expense-evidence-openai.server",()=>({extractExpenseEvidenceWithOpenAI:vi.fn()}));
vi.mock("@/features/finance/expense-evidence-compression.server",()=>({compressExpenseEvidenceFile:vi.fn()}));
import {linkBankTransactionAction} from "./actions";
beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({actor:{organization_id:"org"},resolution:{id:"resolution",approvalLine:[]},binding:null});});
it.each([[null,0,100],["출금",0,100]])("links an evidenced withdrawal with kind %s",async(kind,deposit,withdrawal)=>{
 mocks.single.mockResolvedValue({data:{transacted_at:"2026-09-07T16:00:00Z",transaction_kind:kind,deposit_amount:deposit,withdrawal_amount:withdrawal},error:null});
 expect(await linkBankTransactionAction({resolutionId:"resolution",bankTransactionId:"bank",actorLabel:"ignored"})).toEqual({actualExpenseDate:"2026-09-08",withdrawalAmount:100});expect(mocks.upsert).toHaveBeenCalledTimes(1);
});
it.each([[null,100,100],[null,0,0],["입금",0,100]])("rejects ambiguous or conflicting amounts before updating",async(kind,deposit,withdrawal)=>{
 mocks.single.mockResolvedValue({data:{transacted_at:"2026-09-08",transaction_kind:kind,deposit_amount:deposit,withdrawal_amount:withdrawal},error:null});
 await expect(linkBankTransactionAction({resolutionId:"resolution",bankTransactionId:"bank",actorLabel:"ignored"})).rejects.toThrow("입출금 구분");expect(mocks.upsert).not.toHaveBeenCalled();
});
