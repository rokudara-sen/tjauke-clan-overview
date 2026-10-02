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

## Accounts and registration

7. Run `supabase/migrations/202610030002_accounts_forum.sql` once, after the hunter accounts migration. Accounts that already exist become approved; they choose a username the next time they sign in. It also tries to enable `pg_cron` for an hourly forum purge; if that is not possible it prints a notice and purging runs on forum activity instead.
8. In Authentication → Sign In / Providers, keep email sign-ups enabled. Email confirmation is optional: administrator approval is the real gate, but confirmation proves the address belongs to the person.
9. In Authentication → URL Configuration, set the Site URL to `https://rokudara-sen.github.io/tjauke-clan-overview/` and add `https://rokudara-sen.github.io/tjauke-clan-overview/**` to the redirect URLs, so confirmation and password reset links return to the site. The app uses the PKCE flow, so the link arrives as `?code=` and does not collide with the `#/` page routes. Password reset links add `?reset=1#/reset`, which the wildcard covers.
10. Run `supabase/migrations/202610030003_community.sql` once. It adds witness confirmation, portraits (creating the `portraits` public and `portrait-uploads` private storage buckets with their policies), promotion suggestions, glossary suggestions, account deletion and renaming, pending-work counts, recent changes, and forum read markers, mentions, reports and pinned threads.
11. Run `supabase/migrations/202610040001_standing.sql` once. It separates warrior caste rank (Unblooded to Elite) from senior standing (Elder, Clan Leader, Ancient). Hunters ranked Elder, Leader or Ancient keep that as standing and their warrior rank becomes unrecorded; set it on the hunter record in administration.
12. Run `supabase/migrations/202610050001_household_seniors.sql` once. It makes the Household senior duty the only place a household senior is recorded (see below), and removes anonymous access to functions meant for signed-in accounts.
13. Run `supabase/migrations/202610060001_standing_not_earned.sql` once. Records conferring Elder, Clan Leader or Ancient standing can no longer cite an undertaking: senior standing is conferred, not earned through one hunt. Existing records are left as they are until next edited.

### Household seniors

A duty whose name starts with *Household senior* and names a household is that household's senior appointment. The current one (Active or Acting, no end date, not archived) sets the household's senior, which administration shows read-only. To change a senior, end the current appointment and add a new one; earlier appointments stay in the record. Households that had a senior without such a duty when the migration ran received one, recorded as "Household senior of …".

People request an account at `#/register` with a username, email, password, optionally the hunter they play, and a note. New accounts can sign in but do nothing until an administrator approves them under **Accounts** in administration, optionally linking their hunter at the same time. Administrators can also reject, suspend, reinstate and rename accounts and change hunter links. People can reset a forgotten password from the sign-in page, and delete their own account by typing their username; hunter records stay, and their forum messages remain without a name until they expire. Losing approval removes the hunter link. Emails are never returned by any function the site calls; accounts are identified by username everywhere, including administration.

What a linked hunter can do is decided by `public.hunter_save` in the database, not by the interface:

| Who | Can change |
| --- | --- |
| Every hunter | Own epithet, biography, appearance, hooks and profile link (live). Declare own undertakings (private drafts) and update them until judged. |
| Household senior | Their household's meaning, holding, history and customs (live). Judge and publish undertakings of their household's hunters. |
| Elder, Clan Leader, Ancient standing | Judge and publish any undertaking except their own. Add history entries as drafts; publish drafts written by someone else. |

Rank, standing, household, sponsor, duties, politics, rank history, glossary and published history stay administrator-only. Every hunter change needs a change note and is recorded in the audit trail with the hunter's account as actor.

## Forum

The forum at `#/forum` is open to approved accounts only. Anyone approved can start threads and post; authors can delete their own messages, and administrators can delete any message, lock threads and delete threads. Posts show the username and, when linked, the hunter. Messages are plain text, at most 2000 characters, and limited to 10 per 30 seconds per account.

Messages are not kept: anything older than the retention period (30 days by default) is deleted, and each thread keeps only its newest messages up to the thread limit (200 by default), so a new message removes the oldest. Empty threads past the retention period are removed. Both limits are set under **Forum limits** in administration; lowering them deletes messages straight away. Open threads check for new messages every 5 seconds while the tab is visible.

## Community features

- **Waiting work.** "Your account" shows a count of things waiting for that account: undertakings to judge, history drafts to review, witness requests and forum mentions; for administrators also registrations, portraits, reported messages, glossary suggestions and promotion suggestions. The Forum link shows how many threads have new messages. The administration page lists the waiting items and jumps to each panel.
- **Witnesses.** Naming or changing an undertaking's witness sets *Witness confirmation* to Requested; the witness confirms or declines from their account until the undertaking is judged. Witnesses recorded before this existed are left unanswered rather than assumed confirmed.
- **Advancement suggestions.** Accepted blooding rites by hunters not yet Blooded, without an advancement citing them, appear for administrators with a pre-filled Blooded entry, or *Not an advancement* to stop suggesting it. Personal and training hunts never suggest one, and nothing suggests senior standing.
- **Trophies.** Undertakings, hunter profiles and households list trophies from claims judged Accepted only.
- **Portraits.** A linked hunter uploads a JPEG, PNG or WebP image up to 2 MB into a private bucket. An administrator approves it, which copies it into the public bucket and sets the hunter's portrait, or rejects it, which deletes it.
- **Glossary suggestions.** Approved accounts suggest terms from their account page. They arrive as provisional drafts (at most five waiting per account) for an administrator to publish under the Glossary record type.
- **Recent changes.** The overview lists recently changed published records with the kind of change and date only, never the reason or who made it.
- **Forum.** Threads show new-message counts and a divider where unread messages start. `@username` mentions approved accounts and counts toward their waiting work; lines starting with `>` show as quotes, and *Quote* adds one. Anyone can report someone else's message to the administrators, who delete it or keep it. Pinned threads sort first and keep messages past the time limit; the per-thread cap still applies.

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
