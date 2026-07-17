"use server";
import { revalidatePath } from "next/cache";
import { addMeetingRule, getApprovalSettings, saveApprovalSettings } from "@/features/approval/approval-settings-repository";
const value=(data:FormData,key:string)=>String(data.get(key)??"").trim();
export async function saveApprovalSettingsAction(data: FormData) { const current=await getApprovalSettings(); await saveApprovalSettings({ ...current, meetingThresholdAmount:Number(value(data,"meetingThresholdAmount")), smallExpenseLimit:Number(value(data,"smallExpenseLimit")) }); revalidatePath("/basic-info/approval"); }
export async function addMeetingRuleAction(data: FormData) { const current=await getApprovalSettings(); await addMeetingRule({ keyword:value(data,"keyword"),organizationId:current.organizationId,reason:value(data,"reason"),regulationReference:value(data,"regulationReference"),recommendedBody:value(data,"recommendedBody"),ruleName:value(data,"ruleName") }); revalidatePath("/basic-info/approval"); }
