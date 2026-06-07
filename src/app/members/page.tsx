import { MemberListPage } from "@/features/members/member-list-page";
import { fetchPeopleOnMembersTable, type PeopleOnMembersTableParams } from "@/lib/peopleon/members-table";

type MembersRouteProps = {
  searchParams?: Promise<PeopleOnMembersTableParams>;
};

export default async function MembersRoute({ searchParams }: MembersRouteProps) {
  const params = (await searchParams) ?? {};
  const peopleOnMembers = await fetchPeopleOnMembersTable({ tier: "등기조합원", ...params }).catch(() => null);

  return <MemberListPage initialMembers={peopleOnMembers?.rows} />;
}
