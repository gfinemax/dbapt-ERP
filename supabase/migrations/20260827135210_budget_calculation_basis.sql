alter table approval.budgets
  add column if not exists calculation_basis text not null default '';

with budget_basis(budget_item, calculation_basis) as (
  values
    ('인건비>급여>조합장', '조합장 급여'),
    ('인건비>급여>상근임원', '사무장·상근이사 겸직, 상근임원 1명'),
    ('인건비>급여>직원', '사무직원 급여'),
    ('인건비>상여금', '연 4회 지급, 집행 시 대상별 분개'),
    ('인건비>퇴직금', '조합장·직원 퇴직예치금'),
    ('인건비>기타인건비', '조합부담 4대 보험료'),
    ('복리후생비', '식비 등'),
    ('업무추진비', '사업추진 관련 업무추진비·경조사 등'),
    ('회의비>이사회비', '임·대의원 회의'),
    ('회의비>감사비', '감사수당'),
    ('일반운영비>지급임차료', '사무실 임차료 등'),
    ('일반운영비>도서인쇄비', '신문·소식지·인쇄물 등'),
    ('일반운영비>소모품비', '생수·커피·음료·복사용지·토너 등'),
    ('일반운영비>수선비', '사무실 및 제반 수리비'),
    ('제세공과금>통신비', '전화·팩스·인터넷·AI 업무보조 구독료'),
    ('제세공과금>여비교통비', '유관기관 방문·주유·주차 등'),
    ('제세공과금>수도광열비', '수도·전기·가스요금 등'),
    ('제세공과금>지급수수료', '송금·법무사·운반·주민세 등'),
    ('기타운영비', '신문광고·현수막·홍보비 등'),
    ('예비비', '인건비 제외 운영비의 10% 이내')
)
update approval.budgets b
set calculation_basis = v.calculation_basis, updated_at = now()
from budget_basis v
where b.fiscal_year = 2026 and b.budget_item = v.budget_item;
