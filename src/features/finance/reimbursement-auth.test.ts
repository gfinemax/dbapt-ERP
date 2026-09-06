import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({token:"",getUser:vi.fn(),query:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>mocks.token?{value:mocks.token}:undefined})}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseServerClient:()=>({auth:{getUser:mocks.getUser},schema:()=>({from:mocks.query})})}));
import {requireReimbursementIdentity} from "./reimbursement-auth";
describe("reimbursement authorization",()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.token="";});
 it("never accesses business records without a login",async()=>{
  await expect(requireReimbursementIdentity()).rejects.toThrow("로그인"); expect(mocks.query).not.toHaveBeenCalled();
 });
 it("rejects an invalid access token before reading roles",async()=>{
  mocks.token="invalid";mocks.getUser.mockResolvedValue({data:{user:null},error:new Error("invalid")});
  await expect(requireReimbursementIdentity()).rejects.toThrow("로그인");expect(mocks.query).not.toHaveBeenCalled();
 });
 it("takes identity and permissions from verified Auth and the membership table",async()=>{
  mocks.token="verified-token";mocks.getUser.mockResolvedValue({data:{user:{id:"auth-user"}},error:null});
  const eq=vi.fn(); const q={select:()=>q,eq,limit:async()=>({data:[{user_id:"auth-user",organization_id:"org",permissions:["CLOSE"],active:true,display_name:"담당자"}],error:null})};eq.mockReturnValue(q);mocks.query.mockReturnValue(q);
  expect(await requireReimbursementIdentity()).toMatchObject({user_id:"auth-user",permissions:["CLOSE"]});
  expect(eq).toHaveBeenCalledWith("user_id","auth-user");expect(eq).toHaveBeenCalledWith("active",true);
 });
});
