import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({
  config:vi.fn(),createClient:vi.fn(),signIn:vi.fn(),cookies:vi.fn(),setCookie:vi.fn(),revalidate:vi.fn(),
  command:vi.fn(),createUser:vi.fn(),db:vi.fn(),identity:vi.fn(),select:vi.fn(),eq:vi.fn(),limit:vi.fn(),warn:vi.spyOn(console,"warn").mockImplementation(()=>{}),
}));

vi.mock("@/lib/supabase/config",()=>({getSupabaseServerConfig:mocks.config}));
vi.mock("@supabase/supabase-js",()=>({createClient:mocks.createClient}));
vi.mock("next/headers",()=>({cookies:mocks.cookies}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("@/features/finance/reimbursement-auth",()=>({reimbursementCookie:"erp-reimbursement-access",requireReimbursementIdentity:mocks.identity}));
vi.mock("@/features/finance/reimbursement-repository",()=>({reimbursementDb:mocks.db,reimbursementCommand:mocks.command}));

import { reimbursementLogin, saveReimbursementMember } from "./actions";

const form=(password="password")=>{const data=new FormData();data.set("email","user@example.com");data.set("password",password);return data;};

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.config.mockReturnValue({url:"https://example.supabase.co",key:"server-key"});
  mocks.createClient.mockReturnValue({auth:{signInWithPassword:mocks.signIn}});
  mocks.cookies.mockResolvedValue({set:mocks.setCookie});
  const query={select:mocks.select,eq:mocks.eq,limit:mocks.limit};
  mocks.select.mockReturnValue(query);mocks.eq.mockReturnValue(query);
  mocks.db.mockReturnValue({auth:{admin:{createUser:mocks.createUser}},schema:()=>({from:()=>query})});
  mocks.identity.mockResolvedValue({user_id:"admin",organization_id:"org",display_name:"관리자",permissions:["ADMIN"],active:true});
  mocks.command.mockResolvedValue(undefined);
});

describe("reimbursementLogin",()=>{
  it("returns a safe invalid-credentials result without setting a cookie",async()=>{
    mocks.signIn.mockResolvedValue({data:{session:null,user:null},error:{code:"invalid_credentials",status:400}});
    await expect(reimbursementLogin(form())).resolves.toEqual({ok:false,message:"이메일 또는 비밀번호가 올바르지 않아."});
    expect(mocks.setCookie).not.toHaveBeenCalled();expect(mocks.db).not.toHaveBeenCalled();
  });
  it("does not create a session when the authenticated account has no active reimbursement membership",async()=>{
    mocks.signIn.mockResolvedValue({data:{session:{access_token:"token",expires_in:3600},user:{id:"auth-user"}},error:null});
    mocks.limit.mockResolvedValue({data:[],error:null});
    await expect(reimbursementLogin(form())).resolves.toEqual({ok:false,message:"로그인 계정에 활성 정산 권한이 없어. 정산 관리자에게 계정과 권한 등록을 요청해줘."});
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("sets the secure session cookie only for one active authorized membership",async()=>{
    mocks.signIn.mockResolvedValue({data:{session:{access_token:"token",expires_in:3600},user:{id:"auth-user"}},error:null});
    mocks.limit.mockResolvedValue({data:[{user_id:"auth-user"}],error:null});
    await expect(reimbursementLogin(form())).resolves.toEqual({ok:true,message:"로그인했어."});
    expect(mocks.setCookie).toHaveBeenCalledWith("erp-reimbursement-access","token",expect.objectContaining({httpOnly:true,sameSite:"lax",path:"/",maxAge:3600}));
    expect(mocks.revalidate).toHaveBeenCalled();
  });
  it("converts a four-digit initial PIN before authenticating",async()=>{
    mocks.signIn.mockResolvedValue({data:{session:null,user:null},error:{code:"invalid_credentials",status:400}});
    await reimbursementLogin(form("1234"));
    const credentials=mocks.signIn.mock.calls[0][0];
    expect(credentials.email).toBe("user@example.com");
    expect(credentials.password).not.toBe("1234");
    expect(credentials.password).toMatch(/^Pin![A-Za-z0-9_-]{40,}$/);
  });
  it("creates an account from a four-digit PIN using the same non-raw Auth credential",async()=>{
    mocks.createUser.mockResolvedValue({data:{user:{id:"new-user"}},error:null});
    const data=new FormData();
    data.set("email","director@example.com");data.set("display_name","장현제");data.set("password","1234");data.set("active","on");data.append("permissions","APPROVE");
    await saveReimbursementMember(data);
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({email:"director@example.com",email_confirm:true,password:expect.stringMatching(/^Pin![A-Za-z0-9_-]{40,}$/)}));
    expect(mocks.createUser.mock.calls[0][0].password).not.toBe("1234");
    expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({user_id:"admin"}),"MEMBER",expect.objectContaining({user_id:"new-user",display_name:"장현제"}));
  });
});
