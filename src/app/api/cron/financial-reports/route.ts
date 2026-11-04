import { generateScheduledFinancialReports } from "@/features/reports/financial-report-repository";

export async function GET(request: Request) {
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`) return Response.json({success:false},{status:401});
  const month=Number(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",month:"numeric"}).format(new Date()));
  const reportTypes:Array<"MONTHLY_CASH"|"QUARTERLY_PERFORMANCE">=["MONTHLY_CASH"];
  if([1,4,7,10].includes(month)) reportTypes.push("QUARTERLY_PERFORMANCE");
  const results=await generateScheduledFinancialReports(reportTypes);
  return Response.json({success:true,report_types:reportTypes,organization_count:results.length});
}
