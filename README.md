# Tjau’ke clan archive

Standalone React/Vite frontend for GitHub Pages and a Supabase database. The original workbook and reference files remain unchanged.

## Local preview

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://127.0.0.1:5173/tjauke-clan-overview/. Without configuration, records show an unavailable state rather than misleading zero counts.

For the local workbook preview, set `VITE_LOCAL_SNAPSHOT=true` and place the bounded source-table export in `.local/workbook.json`. That file is ignored by Git, served only by Vite's development server, and never copied into the production bundle. Snapshot mode disables administrator writes even when public Supabase configuration is present. Player handles are withheld. Set the flag to `false` to test the real backend.

## Supabase setup

1. Run `supabase/migrations/202610020001_archive.sql` once in the new project's SQL Editor. The migration is transactional. Do not rerun it against an initialized database.
2. In Authentication → Users, create the intended administrator as an application Auth user. Your Supabase dashboard/GitHub account does not automatically become an application user. Set its password yourself; do not store it in source code or chat.
3. Approve that Auth user in the SQL Editor, replacing the email below:

   ```sql
   insert into private.administrators(user_id)
   select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
   on conflict do nothing;
   ```

4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`, and set `VITE_LOCAL_SNAPSHOT=false`. Restart Vite.
5. Sign in at `#/admin`. Only explicitly approved users can administer records. Public keys are safe to configure in the frontend; secret/service-role keys and database passwords are not.
6. Run `supabase/migrations/202610030001_hunters.sql` once, after the first migration. It adds rank history, the glossary, dated relation assessments and hunter accounts without changing existing records. Until it runs, the public site works but shows these sections empty, and hunter sign-in reports that the update is missing.

## Hunter accounts

Hunters sign in at `#/account`. To give a hunter access, create an Auth user for them in Authentication → Users with a password (they can change it after signing in), then link the email to their hunter record under **Hunter accounts** in administration. One account links to one hunter. Archiving the hunter record removes that account's access.

What a linked hunter can do is decided by `public.hunter_save` in the database, not by the interface:

| Who | Can change |
| --- | --- |
| Every hunter | Own epithet, biography, appearance, hooks and profile link (live). Declare own undertakings (private drafts) and update them until judged. |
| Household senior | Their household's meaning, holding, history and customs (live). Judge and publish undertakings of their household's hunters. |
| Elder, Leader, Ancient | Judge and publish any undertaking except their own. Add history entries as drafts; publish drafts written by someone else. |

Rank, standing, household, sponsor, duties, politics, rank history, glossary and published history stay administrator-only. Every hunter change needs a change note and is recorded in the audit trail with the hunter's account as actor.

To record a change of stance in Politics, open the current assessment in administration and choose **Record a new assessment**. The earlier one is archived in the same transaction and stays visible in that direction's history.

The raw tables have RLS and allowlisted administrator reads only. All writes go through authorization-checked RPCs with typed constraints, stable IDs, optimistic concurrency checks and audit logging. Public reads use `public_archive()`, which returns only published records and strips administrative timestamps and private player handles. Archived published records remain addressable for historical references but are excluded from active totals.

## Migration

Preserve `.local/workbook.json` as the source backup. It contains private metadata and must never be committed or placed in `public/`.

```powershell
npx tsx scripts/prepare-import.ts
```

This validates all references, normalizes headings only for matching, preserves the authored values, and generates `.local/import.json` and `.local/import.sql`. Run the SQL through the project's SQL Editor after the schema and administrator allowlist are configured. All records import as drafts. Review counts, document URLs, chronology and directional relations before publishing records in the administrator UI. Existing IDs are skipped on re-import, never overwritten. Foreign keys are deferred to support member/household cycles. Import failures roll back the entire transaction.

The administrator's **Export backup** downloads all record tables and the private audit trail as JSON. Store it privately. The raw workbook export also preserves source columns that are intentionally excluded from the application, such as legacy request IDs and embedded document text.

## Validation

```powershell
npm test
npm run build
```

Tests use embedded PostgreSQL (PGlite) for the actual migrations, hunter permissions by rank and household seniority, anonymous/ordinary-user/administrator boundaries, audit capture, private-field projection, stale edits, cyclic imports and idempotence. These do not replace hosted authentication and API checks. Test fixtures live only in tests and are never seeded into a real project.

## Deployment

The app uses hash navigation and a `/tjauke-clan-overview/` asset base, so deep links survive GitHub Pages reloads. Configure Pages to use GitHub Actions. Set repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the public project values. The workflow is manually dispatched; it does not publish automatically when code changes are pushed.

Current official setup references: [Vite's GitHub Pages guide](https://vite.dev/guide/static-deploy#github-pages), [Supabase React setup](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs), [Supabase permissions](https://supabase.com/docs/guides/database/postgres/row-level-security).
