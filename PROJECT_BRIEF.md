# Tjau’ke clan website — project handoff

## Start here

The user wants a standalone website for their custom Yautja clan in Colonial Marines Universe (CMU), replacing a Google Sheets canvas and its Apps Script administration. This handoff preserves the decisions from the previous chat. Read it before building; inspect the reference files, then start implementation. Do not ask the user to repeat the requirements.

Repository: https://github.com/rokudara-sen/tjauke-clan-overview

Intended local workspace: `C:\Users\matte_uxe4lif\RiderProjects\tjauke-clan-overview`.

This folder was created for the handoff. Git has NOT been cloned or initialized here by the handoff task. First inspect local state and the remote repository. Connect this folder to that remote while preserving these files and any existing remote contents; do not blindly overwrite either. Use a `codex/` branch for development unless instructed otherwise. This is completely separate from the user's ColonialMarinesUniverse game checkout. Do not edit the game checkout.

## Visual redesign request — 4 October 2026

The user explicitly rejected a lightly restyled dashboard and requested an almost exact structural and interactive adaptation of https://seunghyuk.com/ with the Yautja/Tjau’ke theme. This supersedes the older compact-dashboard/no-large-title visual constraints below. The current local implementation: `#/dashboard` (home) is a WebGL stippled 3D Yautja mask (procedural, `src/maskModel.ts`, sculpted in `src/maskWorker.ts`) with radial section links and faint glossary terms; the mask tracks the pointer, a light follows the pointer across it, and scrolling dives through the mask into `#/clan`. `#/clan` (the "Clan" nav link) is a WebGL 3D star map (`src/starMap.ts`, `src/StarMapPage.tsx`): each section, including Overview, is a named linked star with a cluster of small unlinked stars sized by its published records; the star nearest the pointer lights up, and choosing a star flies into it. Internal links carry a star (`src/fx.ts`, `src/transition.ts`, `src/dock.ts`): the star is the section. Opening a page, it falls under gravity, shatters on the floor, the new page opens through the blast, and the star bounces in one solved arc into that page's dock (the breadcrumb star on inner pages, the mask's left lens at home, the section number on the archive). Returning to `#/clan` (including by clicking the breadcrumb star), the current section's star lifts out as the page sinks and drops back into its own slot on the map. The clan map, archive and inner pages share a WebGL open-space field (`src/Cosmos.tsx`): no atmosphere (no clouds, twinkling or meteors); a volume of stars at real distances with parallax, close dust, a far field with the galactic band and small distant galaxies, and motion blur at speed. On inner pages the viewer drifts forward and scrolling glides them further; on the map, zoom is travel and the dive from home arrives at speed. The header links Clan, Overview and Archive; there is no motion toggle (reduced-motion preferences stop the automatic movement). Stars fall only when a section is chosen inside the mask, star map or archive; returns to `#/clan` rise without a blast; every other link uses a short fade hand-off. Administration (`#/admin/inbox|records|accounts|forum`) and the hunter account (`#/account/profile|undertakings|household|history|settings`) are tabbed workspaces (`src/Workspace.tsx`, `src/workspace.css`) with an editing drawer, a draft/published/archived switch and change notes that prefill when the change is obvious. Inner pages share a night skin (`src/night.css`) and reveal content on scroll; Index and Search burst open from their buttons; fine pointers get a tri-laser targeting cursor (`src/Cursor.tsx`); `#/archive` animates between sections. The data overview remains at `#/overview`, and all existing clan functions, records and administration remain required. These local changes have not been deployed.

## Agreed direction

- GitHub Pages hosts the React frontend.
- Supabase stores persistent records and handles administrator authentication and authorization.
- Google Docs remain the home of long documents; the website stores titles, shelves, abstracts, reading order and document links.
- Google Sheets and Apps Script are retired after successful migration and validation. Do not delete or modify the original workbook as part of building the replacement.
- Build and test locally first. Clearly distinguish a local working preview from a published, configured website.
- No Supabase project, credentials, administrator account, deployment workflow or live website was established in the previous chat. Those remain setup tasks. Ask for genuinely missing setup information while continuing independent frontend work.

## User priorities

The user is frustrated with generic AI-generated interfaces, verbose lore copy, broken references and repeatedly lost data. They want a useful dashboard that feels like Yautja equipment. They do not want another discussion-only plan or a request to explain everything again.

Use plain labels: Dashboard, Hunters, Households, Undertakings, History, Duties, Politics, Documents. Avoid slogans, grandiose names, fake telemetry, fabricated connection status, decorative version numbers, lore paragraphs in navigation, or claims that a record is verified merely because it exists.

Visual direction: dark charcoal metal, bone/off-white readable text, restrained red targeting marks, angular controls and panel edges. Selective monospace for IDs or compact data, ordinary readable typography for prose. No giant welcome hero, serif clan-name billboard, excessive glow, tiny low-contrast text, random glyphs presented as authentic Yautja, or equal-size cards padded with filler. Create a deliberate visual hierarchy around the actual information. The latest reference screenshot is a functional baseline, not a final approved design.

Public dashboard is read-only. It may have navigation, filters, record inspectors and working document links, but no content-editing fields. Administration belongs in a separate authenticated area. Never seed the live clan with demo hunters, documents, history, affiliations or undertakings. Test fixtures belong only in tests.

Preserve user-authored record text. Removing stock UI flavour is not permission to rewrite the clan's history or character biographies. If prose is needed, write it plainly. An earlier request referenced Alan Dean Foster: do not imitate a living author's exact style; broad restrained science-fiction traits are sufficient.

## Public website

### Dashboard

Compact overview with truthful counts, a roster preview, open undertakings, household and duty summaries, history links and document links. Use genuine data and label unavailable/loading/error states separately from empty collections. Keep longer prose in record views. All overview links must actually navigate.

### Hunters

Roster and individual profiles with name, optional epithet, rank, household, sponsor, standing, joined date, player handle where intended public, biography, appearance/equipment, roleplay hooks and optional profile URL. Link household, sponsor, duties, hunts and related history by stable IDs. Show missing references honestly rather than inventing assignments. Support archived records without deleting their historical relationships.

Gameplay ranks: Unblooded, Young Blood, Blooded, Elite, Elder, Leader, Ancient. Do not default an absent rank to Ancient. The reference code includes provisional clan-specific Yautja titles; these are NOT verified canonical translations. Preserve rank data and be explicit about provisional terminology if displaying it.

### Households

Name, estimated meaning, senior, vessel/holding, condition, history/obligations, customs/material identity and automatically derived members. Household senior is a duty, not another rank. Membership uses foreign keys; names are presentation, not identity.

### Undertakings

Hunt declaration and account: title, hunter, witness, real-world date, in-character date/expedition, quarry, declared weapons, additional restrictions, undertaking state, outside contribution, claim judgment, trophy, returned account, judgment grounds and evidence link. Distinguish hunt completion from acceptance of a trophy claim. Open undertakings are derived from states such as Planned, Declared and Underway, not every record.

### History

Readable entries with title, in-character era, reading order, recorded date, category, related hunter/household/hunt, evidence classification, summary, full account and source link. Sort numeric reading order correctly, including zero. Do not pretend in-character chronology is a real-world timestamp. Expansion controls must actually expand/collapse content.

### Duties

Office/duty, holder, household/scope, start/end dates, appointment status and mandate/limits. Show on the holder's profile and relevant household. Retain past appointments.

### Politics

A real directional heatmap: row affiliation's stance toward the column affiliation. Store both directions independently. Names appear across the first row and first column. Self-cells show a dash. Missing relations remain Unknown, never Neutral by default. Support Unknown, Allied, Friendly, Neutral, Rival, Hostile and War. Labels accompany colours. Include reasons, source links and related assessment details.

Yautja clans and outsider factions are distinct categories. Do not assume any canonical outsider alliances or invent factions. Adding a clan automatically expands the matrix. During migration the existing Politics sheet and Relations rows are the source of truth; after migration the database owns it.

### Documents

Document title, shelf, numeric reading order, abstract, exact Google Docs URL. Shelf filters come from real data. Open the URL belonging to that record, not the first matching docs.google.com URL. Google Docs sharing permissions remain independent of the website. Do not embed entire previous lore documents in frontend source code.

## Administrator experience and automation

Provide sign-in and a separate admin area with forms to add, edit and archive all record types above, including document links and clans/relations. Choose related records with human-readable selectors backed by IDs. Validate required fields and URLs, handle failed saves visibly, and prevent accidental repeated submissions. No edit access for ordinary visitors.

Content changes save to Supabase and appear on the public site without committing code or redeploying it. Automatically derive roster counts, household membership, duty backlinks, related history/hunts and matrix dimensions. Preserve record IDs during edits. Prefer archive/restore over destructive deletion where other records reference an item. Provide an export/backup path and an audit trail of administrative changes.

Use database-enforced permissions (Supabase RLS) and approved administrator identity, not just hidden buttons. Public visitors read only intended published fields. Authentication alone must not grant every signed-in user administrative writes. Never include a Supabase service-role key, database password or private GitHub token in browser code or git. Public Supabase URL/publishable key are frontend configuration; privileged secrets stay out of the bundle. Keep audit details and private administrative fields out of public reads.

## Source workbook and migration

Workbook: https://docs.google.com/spreadsheets/d/108BAnQiamMleHXWukRs2FF545QQ85GLV7KNsbUqYXKg/edit

The prior chat read bounded ranges through the connected Google Drive/Sheets tools. Use available Google Drive/Sheets skills and connectors for a fresh read when migrating. The workbook may have changed since the snapshot below. Do not publish raw exports containing administrative metadata as static frontend assets.

Source tables (hidden tabs):

| Table | Fields beyond common metadata |
| --- | --- |
| TK · Members | Yautja name; Epithet / interpretation; Player / Discord; Rank; Agaj’ya / household; Nrak’ytara / sponsor; Standing; Joined; Life and character; Appearance and equipment; Unfinished business / RP hooks; Profile / reference URL |
| TK · Households | Agaj’ya name; Estimated meaning; Household senior; Vessel / holding; Condition; History and obligations; Customs / material identity |
| TK · Hunts | Account title; Hunter; Hult’ah / witness; Real-world session date; In-character date / expedition; Identified quarry; Declared weapons; Additional restrictions; Undertaking; Outside contribution; Claim judgment; Claimed trophy; Returned account; Judgment / grounds; Evidence URL |
| TK · History | Entry title; In-character date / era; Reading order; Recorded date; Category; Related hunter; Related household; Related hunt; Evidence; Opening summary; Full account; Source URL |
| TK · Duties | Duty / office; Holder; Scope / household; From; Until; Appointment; Mandate and limits |
| TK · Library | Document / chapter; Shelf; Reading order; Abstract; Document text; Document URL |
| TK · Affiliations | Affiliation name; Affiliation type; Background / contact notes; Reference URL |
| TK · Relations | Assessment title; From affiliation; Toward affiliation; Stance; Reasons / agreements / context; Source URL |
| TK · Settings | Clan name; Subtitle; Archive introduction; Published Weyland-Yutani dossier URL; CMU / honour code URL |

Common columns: ID, Archived, Created at, Updated at, Request ID. Preserve meaningful IDs and dates. Source archived flags can be booleans or strings. Optional empty cells must not invalidate a whole row. Unicode curly/straight apostrophes differ in column headings and names: normalize for matching, preserve displayed spelling. Prefer IDs for joins and use a unique normalized name only as a migration fallback; flag ambiguous matches.

There is also a visible Politics sheet and generated/legacy display tabs (TK · Clan Overview, Muster, Chronicle, Documents, Rank Register). Those generated display tabs are not replacement source tables. TK · Audit is administrative history, not public clan lore. The canvas tab `Tjau'ke Clan Dashboard` is an OBJECT sheet, not a data grid.

### Verified snapshot from 2 October 2026 (check again before importing)

- 1 hunter: Keth’tar, Ancient; ID `MEM-D6614449-46C`.
- 1 household: Vek’ta; ID `HSE-3A3BB11D-264`. Keth’tar belongs to it and is its senior.
- 2 undertakings: Hunt on Unfamiliar Ground (Planned), The Ash Ravine (Completed, Accepted).
- 12 history entries, 1 active duty, 5 documents.
- 3 affiliations: Tjau’ke (`CLN-SELF`), Kha’drek Clan, Sa’keth Clan.
- 6 directional relations. Tjau’ke → Kha’drek and Kha’drek → Tjau’ke are Hostile. The four directions involving Sa’keth are Neutral. These are authored clan records, not claims about official lore.
- Document shelves include Clan dossier and Language. The living chronicle has reading order 0 and must sort ahead of order 1.

Migrate through a repeatable, non-destructive import with stable legacy IDs or an explicit mapping. Re-running it must not duplicate records. Validate counts, household/senior/sponsor references, exact document URLs, history ordering and directional politics before treating the migration as complete. Account for cyclic links between household senior and member household in import ordering.

## Included references

- `reference/TjaukeClanDashboard.jsx`: most recent single-component React canvas. It contains a tested flexible input adapter and a recent compact presentation update. Use its schema and behaviour as reference, not as an architecture that must be retained.
- `reference/TjaukeClanArchive.gs`: legacy single-file Google Apps Script with prior administration and schema. Reference only; do not deploy Apps Script as the new backend.
- `reference/Dashboard-preview.png`: local desktop screenshot of the latest canvas using real workbook data.
- `reference/Dashboard-mobile-preview.png`: corresponding mobile screenshot.

The React file expects host-injected `data` and `followLink` props. Those will not exist automatically on GitHub Pages. Replace that integration with an actual data service and normal safe links. The old Politics mirror similarly reads supplied sheet ranges and must become a database-derived matrix after migration. Do not ship the old canvas unchanged and claim it is a standalone website.

## Implementation and verification

Use a small maintainable React app (TypeScript/Vite is a reasonable default) with a clear data layer and database migrations. Check current official documentation for GitHub Pages and Supabase setup. Configure asset paths and routing for a project site beneath `/tjauke-clan-overview/`; test direct navigation/reload and avoid Pages 404s. A hash router is an acceptable straightforward solution. Add a GitHub Actions build/deployment workflow when appropriate, but do not claim publishing or remote writes happened unless tools confirm them.

Make meaningful tests for data relationships, archived visibility, numeric sort, unknown relations, form validation, admin access and idempotent import. Build and browser-check the real public and admin interactions, keyboard access, mobile layouts, safe exact links, loading/error/empty states and successful/failed saves. Test database permission boundaries: anonymous read/write and authorized versus unauthorized signed-in users. Never put an administrative bypass in the shipped app to make tests pass.

The last canvas passed 53 local parsing cases and browser checks with the actual workbook snapshot: all eight public sections, profile navigation, household references, exact document URL, two Hostile matrix cells, no editable public fields, mobile overflow containment and no runtime errors. This verifies only the previous local React canvas, not the future standalone app, Supabase setup or GitHub deployment.

## First implementation steps

1. Inspect this folder, the included reference code and remote repository state.
2. Establish the standalone app and local preview without modifying the game repository.
3. Build a usable public dashboard and separate admin flow, then wire persistence and permissions.
4. Obtain the necessary Supabase project configuration/admin identity when integration requires it; continue independent work meanwhile.
5. Import and validate existing records, test and present the real result before deployment decisions that need additional authorization.

Keep the user updated briefly, particularly when a real blocker needs their action. Avoid repeated permission questions for already-authorized local implementation. Do not fabricate missing configuration or silently show zero for an unavailable source.
