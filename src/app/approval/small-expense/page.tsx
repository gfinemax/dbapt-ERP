import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const params = new URLSearchParams({ type: "small" });
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) params.set("month", month);
  redirect(`/approval/inbox?${params}`);
}
