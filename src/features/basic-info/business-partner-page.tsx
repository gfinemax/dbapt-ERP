"use client";

import { Download, FileSpreadsheet, Pencil, Plus, Search, Upload, X } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import {
  buildAccountSubjectFromRecommendation,
  getAccountSubjectSummary,
  getSelectableAccountSubjectRecommendations,
  registeredAccountSubjects,
  type AccountSubjectRecommendation,
  type RegisteredAccountSubject,
} from "./account-subject-data";
import {
  basicInfoWorkflows,
  businessPartnerFilters,
  businessPartners,
  formatKrw,
  getBusinessPartnerSummary,
  registeredBankAccounts,
  registeredCreditCards,
  type BankAccountInput,
  type RegisteredBankAccount,
  type RegisteredCreditCard,
} from "./business-partner-data";

export type BasicInfoSection = "partners" | "items" | "bank-accounts" | "cards" | "account-subjects";
type ModalType = "bank-account" | "card" | null;
type CreateBankAccount = (input: BankAccountInput) => Promise<RegisteredBankAccount>;
type UpdateBankAccount = (id: string, input: BankAccountInput) => Promise<RegisteredBankAccount>;
type CreateAccountSubjects = (input: RegisteredAccountSubject[]) => Promise<RegisteredAccountSubject[]>;

const badgeClasses: Record<string, string> = {
  매출: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  매입: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  혼합: "bg-[var(--color-lilac-mist)] text-[var(--color-amethyst)]",
  채권: "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]",
  채무: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  정산: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  미비: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  사용: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  사용안함: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  정상: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  확인필요: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
};

const detailLabels: Record<BasicInfoSection, string> = {
  partners: "거래처등록",
  items: "품목등록",
  "bank-accounts": "은행통장 등록",
  cards: "신용카드 등록",
  "account-subjects": "계정과목 등록",
};

function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses[value] ?? "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]"}`}>
      {value}
    </span>
  );
}

function maskCardNo(cardNo: string) {
  const digits = cardNo.replace(/\D/g, "");
  const lastFour = digits.slice(-4) || "0000";

  return `****-****-****-${lastFour}`;
}

export function BusinessPartnerPage({
  createAccountSubjects,
  createBankAccount,
  initialAccountSubjects,
  initialBankAccounts,
  initialSection,
  updateBankAccount,
}: {
  createAccountSubjects?: CreateAccountSubjects;
  createBankAccount?: CreateBankAccount;
  initialAccountSubjects?: RegisteredAccountSubject[];
  initialBankAccounts?: RegisteredBankAccount[];
  initialSection?: BasicInfoSection;
  updateBankAccount?: UpdateBankAccount;
} = {}) {
  const activeSection = initialSection ?? "partners";
  const [accountSubjects, setAccountSubjects] = useState<RegisteredAccountSubject[]>(initialAccountSubjects ?? registeredAccountSubjects);
  const [bankAccounts, setBankAccounts] = useState<RegisteredBankAccount[]>(initialBankAccounts ?? registeredBankAccounts);
  const [creditCards, setCreditCards] = useState<RegisteredCreditCard[]>(registeredCreditCards);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [editingBankAccount, setEditingBankAccount] = useState<RegisteredBankAccount | null>(null);
  const activeDetailLabel = detailLabels[activeSection];

  function closeModal() {
    setModalError(null);
    setEditingBankAccount(null);
    setModalType(null);
  }

  return (
    <ErpShell activeDetailLabel={activeDetailLabel} activeLabel="회계/자금" activeWorkspaceLabel="기초정보">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        {activeSection === "bank-accounts" ? (
          <BankAccountSection
            accounts={bankAccounts}
            onAdd={() => {
              setEditingBankAccount(null);
              setModalError(null);
              setModalType("bank-account");
            }}
            onEdit={(account) => {
              setEditingBankAccount(account);
              setModalError(null);
              setModalType("bank-account");
            }}
          />
        ) : activeSection === "cards" ? (
          <CreditCardSection cards={creditCards} onAdd={() => setModalType("card")} />
        ) : activeSection === "account-subjects" ? (
          <AccountSubjectSection
            onRegister={async (recommendations) => {
              const subjects = recommendations.map(buildAccountSubjectFromRecommendation);
              const savedSubjects = createAccountSubjects ? await createAccountSubjects(subjects) : subjects;
              setAccountSubjects((current) => mergeAccountSubjects(current, savedSubjects));
            }}
            subjects={accountSubjects}
          />
        ) : (
          <PartnerSection />
        )}
      </div>

      {modalType === "bank-account" ? (
        <BankAccountModal
          initialAccount={editingBankAccount}
          onClose={closeModal}
          onSave={async (input) => {
            setModalError(null);
            try {
              if (editingBankAccount) {
                const account = updateBankAccount ? await updateBankAccount(editingBankAccount.id, input) : buildUpdatedLocalBankAccount(editingBankAccount, input);
                setBankAccounts((current) => current.map((item) => (item.id === account.id ? account : item)));
              } else {
                const account = createBankAccount ? await createBankAccount(input) : buildLocalBankAccount(input);
                setBankAccounts((current) => [...current, account]);
              }
              closeModal();
            } catch (error) {
              setModalError(error instanceof Error ? error.message : "은행통장 저장에 실패했습니다.");
            }
          }}
          saveError={modalError}
        />
      ) : null}

      {modalType === "card" ? (
        <CreditCardModal
          onClose={() => setModalType(null)}
          onSave={(card) => {
            setCreditCards((current) => [...current, card]);
            setModalType(null);
          }}
        />
      ) : null}
    </ErpShell>
  );
}

function PartnerSection() {
  const summary = getBusinessPartnerSummary();

  return (
    <>
      <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
        <div>
          <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
            회계/자금 &gt; 기초정보 &gt; 거래처등록 &gt; 유형선택 &gt; 건별등록/엑셀 일괄등록
          </p>
          <h1 className="text-3xl font-bold tracking-normal">거래처 관리</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
            세금계산서 및 채권/채무 관리를 위한 거래처 정보를 등록합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-full" size="lg" variant="outline">
            <Upload className="size-4" />
            엑셀 일괄등록
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" size="lg">
            <Plus className="size-4" />
            건별등록
          </Button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {basicInfoWorkflows.map((workflow, index) => (
          <a
            className={
              index === 0
                ? "rounded-2xl border border-[var(--color-deep-cobalt)] bg-[var(--color-morning-tint)] p-5"
                : "rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 transition hover:border-[var(--color-deep-cobalt)]"
            }
            href={
              workflow.title === "은행통장 등록"
                ? "/basic-info?section=bank-accounts"
                : workflow.title === "신용카드 등록"
                  ? "/basic-info?section=cards"
                  : workflow.title === "계정과목 등록"
                    ? "/basic-info?section=account-subjects"
                  : workflow.title === "품목등록"
                    ? "/basic-info?section=items"
                    : "/basic-info?section=partners"
            }
            key={workflow.title}
          >
            <p className="text-xs font-bold text-[var(--color-fog)]">업무흐름 {index + 1}</p>
            <p className="mt-3 text-lg font-bold">{workflow.title}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">{workflow.description}</p>
          </a>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <SummaryTile label="등록 거래처" value={`${summary.totalPartners}건`} />
        <SummaryTile label="채권 거래처" value={`${summary.receivablePartners}건`} />
        <SummaryTile label="채무 거래처" value={`${summary.payablePartners}건`} />
        <SummaryTile label="정보 미비" value={`${summary.missingEvidenceProfiles}건`} />
      </section>

      <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)] xl:w-[440px]">
            <Search className="size-4 shrink-0" />
            <span>거래처명 or 사업자(주민)번호 검색</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-2 text-sm font-semibold text-[var(--color-stone)]">유형선택</span>
            {businessPartnerFilters.map((filter) => (
              <button
                className="rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-stone)] first:bg-[var(--color-pressed-charcoal)] first:text-white"
                key={filter}
                type="button"
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--color-cloud-veil)] px-4 py-3 text-sm text-[var(--color-stone)]">
          <span>방법 A. 건별등록 / 방법 B. 엑셀일괄등록</span>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full" size="sm" variant="outline">
              <FileSpreadsheet className="size-4" />
              엑셀 가져오기
            </Button>
            <Button className="rounded-full" size="sm" variant="outline">
              <Download className="size-4" />
              엑셀 내보내기
            </Button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
              <tr>
                <th className="px-4 py-3 text-center">코드</th>
                <th className="px-4 py-3 text-center">유형</th>
                <th className="px-4 py-3 text-center">사업자구분</th>
                <th className="px-4 py-3 text-center">거래처명</th>
                <th className="px-4 py-3 text-center">사업자(주민)번호</th>
                <th className="px-4 py-3 text-center">대표자</th>
                <th className="px-4 py-3 text-center">업태</th>
                <th className="px-4 py-3 text-center">종목</th>
                <th className="px-4 py-3 text-center">프로젝트</th>
                <th className="px-4 py-3 text-center">채권/채무</th>
                <th className="px-4 py-3 text-center">잔액</th>
                <th className="px-4 py-3 text-center">정보</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-soft-border)]">
              {businessPartners.map((partner) => (
                <tr className="bg-white/70" key={partner.id}>
                  <td className="px-4 py-4 font-semibold">{partner.code}</td>
                  <td className="px-4 py-4">
                    <Badge value={partner.type} />
                  </td>
                  <td className="px-4 py-4 text-[var(--color-stone)]">{partner.ownerType}</td>
                  <td className="px-4 py-4 font-semibold">{partner.name}</td>
                  <td className="px-4 py-4 text-[var(--color-stone)]">{partner.registrationNo}</td>
                  <td className="px-4 py-4">{partner.representative}</td>
                  <td className="px-4 py-4 text-[var(--color-stone)]">{partner.businessCategory}</td>
                  <td className="px-4 py-4 text-[var(--color-stone)]">{partner.businessItem}</td>
                  <td className="px-4 py-4 text-[var(--color-stone)]">{partner.projectScope}</td>
                  <td className="px-4 py-4">
                    <Badge value={partner.balanceType} />
                  </td>
                  <td className="px-4 py-4 text-right font-semibold">{formatKrw(partner.balanceAmount)}</td>
                  <td className="px-4 py-4">
                    <Badge value={partner.evidenceProfileStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function AccountSubjectSection({
  onRegister,
  subjects,
}: {
  onRegister: (recommendations: AccountSubjectRecommendation[]) => Promise<void>;
  subjects: RegisteredAccountSubject[];
}) {
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const selectableRecommendations = getSelectableAccountSubjectRecommendations(subjects);
  const selectedRecommendations = selectableRecommendations.filter((item) => selectedCodes.includes(item.code));
  const operatingRecommendations = selectableRecommendations.filter((item) => item.source === "운영비 예산안");
  const feasibilityRecommendations = selectableRecommendations.filter((item) => item.source === "수지분석표");
  const summary = getAccountSubjectSummary(subjects);

  function toggleRecommendation(code: string) {
    setSelectedCodes((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  }

  async function registerSelected() {
    if (selectedRecommendations.length === 0) {
      return;
    }

    setSaveError(null);
    setIsSaving(true);

    try {
      await onRegister(selectedRecommendations);
      setSelectedCodes([]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "계정과목 등록에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
        <div>
          <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
            회계/자금 &gt; 기초정보 &gt; 계정과목 등록
          </p>
          <h1 className="text-3xl font-bold tracking-normal">계정과목 등록</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
            운영비 예산안과 수지분석표 기준 추천 계정과목을 선택해 등록합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-full" size="lg" variant="outline">
            <Upload className="size-4" />
            엑셀 가져오기
          </Button>
          <Button
            className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]"
            disabled={selectedRecommendations.length === 0 || isSaving}
            onClick={registerSelected}
            size="lg"
            type="button"
          >
            <Plus className="size-4" />
            선택 항목 등록
          </Button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <SummaryTile label="사용 계정과목" value={`${summary.activeSubjects}개`} />
        <SummaryTile label="수입 계정" value={`${summary.incomeSubjects}개`} />
        <SummaryTile label="지출 계정" value={`${summary.expenseSubjects}개`} />
        <SummaryTile label="수지분석 연계" value={`${summary.valueOnReadySubjects}개`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <RecommendationPanel
          description="급여, 임대료, 통신비처럼 매월 운영비 예산과 연결되는 계정과목입니다."
          recommendations={operatingRecommendations}
          selectedCodes={selectedCodes}
          title="운영비 예산안 기준"
          onToggle={toggleRecommendation}
        />
        <RecommendationPanel
          description="토지비, 공사비, 금융비용처럼 ValueOn 수지분석 항목과 비교할 수 있는 계정과목입니다."
          recommendations={feasibilityRecommendations}
          selectedCodes={selectedCodes}
          title="수지분석표 기준"
          onToggle={toggleRecommendation}
        />
      </section>

      {saveError ? <p className="rounded-xl bg-[var(--color-sunset-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-tangerine)]">{saveError}</p> : null}

      <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
        <div className="border-b border-[var(--color-soft-border)] px-5 py-4">
          <h2 className="text-lg font-bold">등록된 계정과목</h2>
          <p className="mt-1 text-sm text-[var(--color-stone)]">전표, 은행거래 매칭, 운영비 예산, 수지분석 비교에 공통으로 사용합니다.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
              <tr>
                <th className="px-4 py-3 text-center">코드</th>
                <th className="px-4 py-3 text-center">계정과목</th>
                <th className="px-4 py-3 text-center">수입/지출</th>
                <th className="px-4 py-3 text-center">업무분류</th>
                <th className="px-4 py-3 text-center">출처</th>
                <th className="px-4 py-3 text-center">별칭</th>
                <th className="px-4 py-3 text-center">설명</th>
                <th className="px-4 py-3 text-center">사용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-soft-border)]">
              {subjects.map((subject) => (
                <tr className="bg-white/70" key={subject.id}>
                  <td className="px-4 py-4 font-semibold">{subject.code}</td>
                  <td className="px-4 py-4 font-semibold">{subject.name}</td>
                  <td className="px-4 py-4">
                    <Badge value={subject.subjectType} />
                  </td>
                  <td className="px-4 py-4">{subject.businessCategory}</td>
                  <td className="px-4 py-4">
                    <Badge value={subject.source} />
                  </td>
                  <td className="px-4 py-4 text-[var(--color-stone)]">{subject.aliases.join(", ") || "-"}</td>
                  <td className="px-4 py-4 text-[var(--color-stone)]">{subject.description}</td>
                  <td className="px-4 py-4">
                    <Badge value={subject.isActive ? "사용" : "사용안함"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function RecommendationPanel({
  description,
  onToggle,
  recommendations,
  selectedCodes,
  title,
}: {
  description: string;
  onToggle: (code: string) => void;
  recommendations: AccountSubjectRecommendation[];
  selectedCodes: string[];
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-stone)]">{description}</p>
        </div>
        <span className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-1 text-xs font-semibold text-[var(--color-stone)]">{recommendations.length}개</span>
      </div>
      <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1">
        {recommendations.map((recommendation) => {
          const isSelected = selectedCodes.includes(recommendation.code);

          return (
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                isSelected ? "border-[var(--color-deep-cobalt)] bg-[var(--color-morning-tint)]" : "border-[var(--color-soft-border)] bg-white"
              }`}
              key={recommendation.code}
            >
              <input
                aria-label={`추천 계정과목 ${recommendation.name} 선택`}
                checked={isSelected}
                className="mt-1 size-4"
                onChange={() => onToggle(recommendation.code)}
                type="checkbox"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{recommendation.name}</span>
                  <span className="rounded-full bg-[var(--color-cloud-veil)] px-2 py-0.5 text-xs font-semibold text-[var(--color-stone)]">{recommendation.code}</span>
                  <span className="rounded-full bg-[var(--color-butter-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--color-mustard)]">{recommendation.businessCategory}</span>
                </span>
                <span className="mt-1 block text-sm leading-6 text-[var(--color-stone)]">{recommendation.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function BankAccountSection({
  accounts,
  onAdd,
  onEdit,
}: {
  accounts: RegisteredBankAccount[];
  onAdd: () => void;
  onEdit: (account: RegisteredBankAccount) => void;
}) {
  return (
    <>
      <RegistrationHeader
        actionLabel="은행통장 추가"
        description="조합 신탁계좌, 운영계좌, 토지비 계좌 등 계좌 기본정보를 등록하고 연동 상태를 확인합니다."
        onAdd={onAdd}
        title="은행통장 등록"
      />

      <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
            <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
              <tr>
                <th className="px-4 py-3 text-center">은행명</th>
                <th className="px-4 py-3 text-center">계좌명</th>
                <th className="px-4 py-3 text-center">계좌번호</th>
                <th className="px-4 py-3 text-center">계좌구분</th>
                <th className="px-4 py-3 text-center">개설일</th>
                <th className="px-4 py-3 text-center">사용여부</th>
                <th className="px-4 py-3 text-center">최근 동기화</th>
                <th className="px-4 py-3 text-center">연동상태</th>
                <th className="px-4 py-3 text-center">미매칭</th>
                <th className="px-4 py-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-soft-border)]">
              {accounts.length === 0 ? (
                <tr className="bg-white/70">
                  <td className="px-4 py-10 text-center text-[var(--color-stone)]" colSpan={10}>
                    등록된 은행통장이 없습니다.
                  </td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr className="bg-white/70" key={account.id}>
                    <td className="px-4 py-4 text-[var(--color-stone)]">{account.bankName}</td>
                    <td className="px-4 py-4 font-semibold">{account.accountName}</td>
                    <td className="px-4 py-4">{account.accountNo}</td>
                    <td className="px-4 py-4">{account.accountType}</td>
                    <td className="px-4 py-4 text-[var(--color-stone)]">{account.createdAt}</td>
                    <td className="px-4 py-4">
                      <Badge value={account.usageStatus} />
                    </td>
                    <td className="px-4 py-4 text-[var(--color-stone)]">{account.lastSyncedAt}</td>
                    <td className="px-4 py-4">
                      <Badge value={account.status} />
                    </td>
                    <td className="px-4 py-4 text-right font-semibold">{account.unmatchedCount}건</td>
                    <td className="px-4 py-4 text-right">
                      <Button className="rounded-full" onClick={() => onEdit(account)} size="sm" type="button" variant="outline">
                        <Pencil className="size-3.5" />
                        수정
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function CreditCardSection({ cards, onAdd }: { cards: RegisteredCreditCard[]; onAdd: () => void }) {
  return (
    <>
      <RegistrationHeader
        actionLabel="신용카드 추가"
        description="법인카드, 업무대행 카드 등 카드 기본정보와 인증정보를 등록하고 사용 상태를 관리합니다."
        onAdd={onAdd}
        title="신용카드 등록"
      />

      <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
            <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
              <tr>
                <th className="px-4 py-3 text-center">카드사</th>
                <th className="px-4 py-3 text-center">카드명</th>
                <th className="px-4 py-3 text-center">카드번호</th>
                <th className="px-4 py-3 text-center">카드구분</th>
                <th className="px-4 py-3 text-center">카드 발급일</th>
                <th className="px-4 py-3 text-center">사용여부</th>
                <th className="px-4 py-3 text-center">결제은행</th>
                <th className="px-4 py-3 text-center">사용한도</th>
                <th className="px-4 py-3 text-center">최근 동기화</th>
                <th className="px-4 py-3 text-center">연동상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-soft-border)]">
              {cards.map((card) => (
                <tr className="bg-white/70" key={card.id}>
                  <td className="px-4 py-4 text-[var(--color-stone)]">{card.cardCompany}</td>
                  <td className="px-4 py-4 font-semibold">{card.cardName}</td>
                  <td className="px-4 py-4">{card.cardNo}</td>
                  <td className="px-4 py-4">{card.cardType}</td>
                  <td className="px-4 py-4 text-[var(--color-stone)]">{card.createdAt}</td>
                  <td className="px-4 py-4">
                    <Badge value={card.usageStatus} />
                  </td>
                  <td className="px-4 py-4 text-[var(--color-stone)]">{card.settlementBank}</td>
                  <td className="px-4 py-4 text-right font-semibold">{formatKrw(card.limitAmount)}</td>
                  <td className="px-4 py-4 text-[var(--color-stone)]">{card.lastSyncedAt}</td>
                  <td className="px-4 py-4">
                    <Badge value={card.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function RegistrationHeader({
  actionLabel,
  description,
  onAdd,
  title,
}: {
  actionLabel: string;
  description: string;
  onAdd: () => void;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
      <div>
        <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
          회계/자금 &gt; 기초정보 &gt; {title}
        </p>
        <h1 className="text-3xl font-bold tracking-normal">{title}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="rounded-full" size="lg" variant="outline">
          <Upload className="size-4" />
          엑셀 가져오기
        </Button>
        <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={onAdd} size="lg">
          <Plus className="size-4" />
          {actionLabel}
        </Button>
      </div>
    </section>
  );
}

function BankAccountModal({
  initialAccount,
  onClose,
  onSave,
  saveError,
}: {
  initialAccount?: RegisteredBankAccount | null;
  onClose: () => void;
  onSave: (input: BankAccountInput) => Promise<void>;
  saveError: string | null;
}) {
  const isEditMode = Boolean(initialAccount);
  const [form, setForm] = useState({
    accountName: initialAccount?.accountName ?? "",
    accountNo: initialAccount?.accountNo ?? "",
    accountType: initialAccount?.accountType ?? ("운영계좌" as RegisteredBankAccount["accountType"]),
    bankName: initialAccount?.bankName ?? "우리은행",
    createdAt: initialAccount?.createdAt ?? getTodayDate(),
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await onSave({
      accountName: form.accountName || "신규 운영계좌",
      accountNo: form.accountNo || "계좌번호 미입력",
      accountType: form.accountType,
      bankName: form.bankName || "우리은행",
      createdAt: form.createdAt || getTodayDate(),
    });
  }

  return (
    <ModalFrame onClose={onClose} title={isEditMode ? "은행통장 수정" : "은행통장 등록"}>
      <form className="grid gap-4" onSubmit={submit}>
        <FormInput label="은행명" onChange={(value) => setForm((current) => ({ ...current, bankName: value }))} value={form.bankName} />
        <FormInput label="계좌명" onChange={(value) => setForm((current) => ({ ...current, accountName: value }))} value={form.accountName} />
        <FormInput label="계좌번호" onChange={(value) => setForm((current) => ({ ...current, accountNo: value }))} value={form.accountNo} />
        <FormInput label="개설일" onChange={(value) => setForm((current) => ({ ...current, createdAt: value }))} type="date" value={form.createdAt} />
        <label className="grid gap-1.5 text-sm font-semibold">
          계좌구분
          <select
            className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm font-medium text-[var(--color-midnight-ink)]"
            onChange={(event) => setForm((current) => ({ ...current, accountType: event.target.value as RegisteredBankAccount["accountType"] }))}
            value={form.accountType}
          >
            <option>신탁계좌</option>
            <option>운영계좌</option>
            <option>토지비계좌</option>
          </select>
        </label>
        {saveError ? <p className="rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]">{saveError}</p> : null}
        <ModalActions onClose={onClose} />
      </form>
    </ModalFrame>
  );
}

function buildLocalBankAccount(input: BankAccountInput): RegisteredBankAccount {
  return {
    ...input,
    id: `bank-${Date.now()}`,
    lastSyncedAt: "미연동",
    status: "확인필요",
    unmatchedCount: 0,
    usageStatus: "사용",
  };
}

function buildUpdatedLocalBankAccount(account: RegisteredBankAccount, input: BankAccountInput): RegisteredBankAccount {
  return {
    ...account,
    ...input,
  };
}

function mergeAccountSubjects(current: RegisteredAccountSubject[], additions: RegisteredAccountSubject[]) {
  const existingNames = new Set(current.map((subject) => subject.name));
  const nextSubjects = additions.filter((subject) => !existingNames.has(subject.name));

  return [...current, ...nextSubjects].sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code));
}

function CreditCardModal({ onClose, onSave }: { onClose: () => void; onSave: (card: RegisteredCreditCard) => void }) {
  const [form, setForm] = useState({
    cardCompany: "KB국민카드",
    cardName: "",
    cardNo: "",
    cardType: "법인카드" as RegisteredCreditCard["cardType"],
    createdAt: getTodayDate(),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onSave({
      cardCompany: form.cardCompany || "KB국민카드",
      cardName: form.cardName || "신규 법인카드",
      cardNo: maskCardNo(form.cardNo),
      cardType: form.cardType,
      createdAt: form.createdAt || getTodayDate(),
      id: `card-${Date.now()}`,
      lastSyncedAt: "미연동",
      limitAmount: 0,
      settlementBank: "미지정",
      status: "확인필요",
      usageStatus: "사용",
    });
  }

  return (
    <ModalFrame onClose={onClose} title="신용카드 등록">
      <form className="grid gap-4" onSubmit={submit}>
        <FormInput label="카드사" onChange={(value) => setForm((current) => ({ ...current, cardCompany: value }))} value={form.cardCompany} />
        <FormInput label="카드명" onChange={(value) => setForm((current) => ({ ...current, cardName: value }))} value={form.cardName} />
        <FormInput label="카드번호" onChange={(value) => setForm((current) => ({ ...current, cardNo: value }))} value={form.cardNo} />
        <FormInput label="카드 발급일" onChange={(value) => setForm((current) => ({ ...current, createdAt: value }))} type="date" value={form.createdAt} />
        <label className="grid gap-1.5 text-sm font-semibold">
          카드구분
          <select
            className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm font-medium text-[var(--color-midnight-ink)]"
            onChange={(event) => setForm((current) => ({ ...current, cardType: event.target.value as RegisteredCreditCard["cardType"] }))}
            value={form.cardType}
          >
            <option>법인카드</option>
            <option>업무대행카드</option>
          </select>
        </label>
        <ModalActions onClose={onClose} />
      </form>
    </ModalFrame>
  );
}

function ModalFrame({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <section
        aria-labelledby="basic-info-modal-title"
        aria-modal="true"
        className="w-full max-w-xl rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 shadow-2xl"
        role="dialog"
      >
        <div className="mb-4 flex items-center justify-between gap-4 border-b border-[var(--color-soft-border)] pb-3">
          <h2 className="text-lg font-bold" id="basic-info-modal-title">
            {title}
          </h2>
          <button
            aria-label="닫기"
            className="flex size-8 items-center justify-center rounded-full border border-[var(--color-soft-border)] text-[var(--color-stone)]"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function FormInput({ label, onChange, type = "text", value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <input
        className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm font-medium text-[var(--color-midnight-ink)]"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function ModalActions({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-2 flex justify-end gap-2 border-t border-[var(--color-soft-border)] pt-4">
      <Button className="rounded-full" onClick={onClose} type="button" variant="outline">
        취소
      </Button>
      <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" type="submit">
        저장
      </Button>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
      <p className="text-sm font-semibold text-[var(--color-stone)]">{label}</p>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </div>
  );
}
