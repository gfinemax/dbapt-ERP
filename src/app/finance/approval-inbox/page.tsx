import { redirect } from "next/navigation";
export default async function ApprovalInboxRoute() {
  redirect("/approval/inbox?type=expense");
}
