import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { BusinessPartner, BusinessPartnerOcrInput, BusinessPartnerRegistrationResult } from "./business-partner-data";

export const businessPartnerRepositorySchema = "core";
const partnerSelect = "id,code,partner_type,owner_type,name,registration_no,representative,business_category,business_item,address,project_scope,phone,balance_type,balance_amount,evidence_profile_status,registration_source,first_transaction_date,source_resolution_no,source_evidence_id";

export type SupabaseBusinessPartnerRow = {
  address: string | null;
  balance_amount: number;
  balance_type: BusinessPartner["balanceType"];
  business_category: string;
  business_item: string;
  code: string;
  evidence_profile_status: BusinessPartner["evidenceProfileStatus"];
  first_transaction_date: string | null;
  id: string;
  name: string;
  owner_type: BusinessPartner["ownerType"];
  partner_type: BusinessPartner["type"];
  phone: string;
  project_scope: string;
  registration_no: string;
  registration_source: BusinessPartner["registrationSource"];
  representative: string;
  source_evidence_id: string | null;
  source_resolution_no: string | null;
};

export function normalizeBusinessRegistrationNo(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : digits;
}

export function mapBusinessPartnerFromRow(row: SupabaseBusinessPartnerRow): BusinessPartner {
  return {
    address: row.address ?? undefined,
    balanceAmount: Number(row.balance_amount),
    balanceType: row.balance_type,
    businessCategory: row.business_category,
    businessItem: row.business_item,
    code: row.code,
    evidenceProfileStatus: row.evidence_profile_status,
    firstTransactionDate: row.first_transaction_date ?? undefined,
    id: row.id,
    name: row.name,
    ownerType: row.owner_type,
    phone: row.phone,
    projectScope: row.project_scope,
    registrationNo: row.registration_no,
    registrationSource: row.registration_source,
    representative: row.representative,
    sourceEvidenceId: row.source_evidence_id ?? undefined,
    sourceResolutionNo: row.source_resolution_no ?? undefined,
    type: row.partner_type,
  };
}

export function mapOcrPartnerToInsert(input: BusinessPartnerOcrInput) {
  const registrationNo = normalizeBusinessRegistrationNo(input.registrationNo);
  return {
    address: input.address?.trim() || null,
    balance_amount: 0,
    balance_type: "채무",
    business_category: input.businessCategory?.trim() || "미입력",
    business_item: input.businessItem?.trim() || "미입력",
    code: `BP-OCR-${registrationNo.replace(/\D/g, "")}`,
    evidence_profile_status: input.name.trim() && registrationNo.length === 12 && input.representative?.trim() && input.address?.trim() ? "완료" : "미비",
    first_transaction_date: input.firstTransactionDate || null,
    name: input.name.trim(),
    owner_type: "사업자",
    partner_type: "매입",
    phone: input.phone?.trim() || "",
    project_scope: "회계/자금",
    registration_no: registrationNo,
    registration_source: "OCR 자동등록",
    representative: input.representative?.trim() || "미입력",
    source_evidence_id: input.evidenceId,
    source_resolution_no: input.resolutionNo,
  };
}

export async function listBusinessPartnersFromSupabase(): Promise<BusinessPartner[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.schema(businessPartnerRepositorySchema).from("business_partners").select(partnerSelect).is("deleted_at", null).order("created_at", { ascending: true });
  if (error) return null;
  return (data as SupabaseBusinessPartnerRow[]).map(mapBusinessPartnerFromRow);
}

export async function ensureBusinessPartnerFromOcrInSupabase(input: BusinessPartnerOcrInput): Promise<BusinessPartnerRegistrationResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const registrationNo = normalizeBusinessRegistrationNo(input.registrationNo);
  if (!input.name.trim()) throw new Error("거래처명이 없어 자동등록할 수 없습니다.");
  if (registrationNo.replace(/\D/g, "").length !== 10) throw new Error("사업자등록번호 10자리를 확인한 후 거래처를 등록해 주세요.");

  const existingQuery = await supabase.schema(businessPartnerRepositorySchema).from("business_partners").select(partnerSelect).eq("registration_no", registrationNo).is("deleted_at", null).maybeSingle();
  if (existingQuery.error) throw new Error(`거래처 중복조회 실패: ${existingQuery.error.message}`);
  if (existingQuery.data) return { partner: mapBusinessPartnerFromRow(existingQuery.data as SupabaseBusinessPartnerRow), status: "EXISTING" };

  const { data, error } = await supabase.schema(businessPartnerRepositorySchema).from("business_partners").insert(mapOcrPartnerToInsert(input)).select(partnerSelect).single();
  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      const retry = await supabase.schema(businessPartnerRepositorySchema).from("business_partners").select(partnerSelect).eq("registration_no", registrationNo).is("deleted_at", null).single();
      if (!retry.error && retry.data) return { partner: mapBusinessPartnerFromRow(retry.data as SupabaseBusinessPartnerRow), status: "EXISTING" };
    }
    throw new Error(`거래처 자동등록 실패: ${error.message}`);
  }
  return { partner: mapBusinessPartnerFromRow(data as SupabaseBusinessPartnerRow), status: "CREATED" };
}
