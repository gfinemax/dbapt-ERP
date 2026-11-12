This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Google Sheets export

Bank transaction search results can be exported to a Google spreadsheet. Enable the Google Drive
and Google Sheets APIs for a service account, add that service account as a member of the destination
Google Workspace shared drive, and set these server-side environment variables:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=erp-export@example.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_FOLDER_ID=shared-drive-folder-id
```

The export creates `거래내역` and `내보내기 정보` sheets in that folder. Apply the matching
Supabase migration before enabling the option so `GOOGLE_SHEETS` audit entries are accepted.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Ledger contribution sync

Set `LEDGER_INTEGRATION_URL` and the shared `LEDGER_INTEGRATION_SECRET` on the server.
The collections page pulls immutable contribution assessment events from dbapt-ledger with
timestamped HMAC SHA-256 requests. ERP stores the ledger assessment ID and PeopleON member ID,
keeps unresolved identity links in a review queue, and remains authoritative for bank receipts,
allocation, evidence, and reports.

External contribution recognitions are pulled separately from
`/api/integrations/erp/external-contribution-recognitions`. Each cursor-ordered item must include
`source_recognition_id`, `source_version`, `source_assessment_id`, `external_member_id`,
`recognized_on`, `recognized_amount`, `recognition_type`, `reason`, `status`,
`source_updated_at`, and `payload_hash`. ERP counts active recognitions toward the assessment
balance but never creates a bank transaction or adds the amount to cash reports. Unknown
assessments, member mismatches, over-recognition, and malformed items remain in the review queue.
