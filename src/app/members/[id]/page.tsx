import { MemberDetailPage } from "@/features/members/member-detail-page";

type MemberDetailRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function MemberDetailRoute({ params }: MemberDetailRouteProps) {
  const { id } = await params;

  return <MemberDetailPage memberId={id} />;
}
