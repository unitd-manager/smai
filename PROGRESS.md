# United Technologies implementation progress

## 2026-11-20 — Campaign intelligence workflow

- [x] Add an authenticated, workspace-scoped campaign strategy endpoint with multi-provider AI fallback and strict strategy validation.
- [x] Use the saved brand profile, content/media inventory, active Marketing Brain recommendations, and previous campaigns as campaign context; mark external research limitations instead of inventing facts.
- [x] Persist strategy-first campaign plans in the existing ContentPlan model, with campaign lifecycle, task records, KPI target, content references, date sequence, readiness checks, duplication, and export data.
- [x] Add campaign objectives, success target, audience, platform, format, duration, and optional budget inputs; review and edit strategic positioning before explicitly generating assets.
- [x] Persist generated assets incrementally so partial campaigns can be reopened and continued; assign tasks to workspace members and gate approval on all planned assets and other critical readiness checks.
- [x] Clearly distinguish Instagram publishing support from draft-only channels and avoid presenting non-attributed analytics as campaign performance.
- [ ] Verify strategy generation and campaign lifecycle end-to-end with a configured AI provider and authenticated workspace. Real market research, paid ads, and campaign-attributed optimization/reporting still need external integrations and post-to-campaign attribution.

## 2026-11-16

- [x] Remove app-level monthly AI generation caps during the active 14-day trial across content, caption regeneration, artwork, and video-plan generation. Trial expiry remains enforced; AI-provider rate limits and platform constraints still apply. The Create and Campaigns screens report trial generation usage as unlimited.

## 2026-11-14 implementation continuation

### Gallery screenshot follow-up — source-level corrections

- [x] Reconcile late legacy overrides: the midnight theme had forced a 194px sidebar while the main area reserved a different width. Both now use the persisted resizable sidebar width; mobile resets the main area to full width.
- [x] Enforce the requested Inter-only system across app shell typography, migrate old saved editorial/classic font selections to modern on preference normalization, and remove the misleading font-pairing selector.
- [x] Keep Gallery upload in its page actions and use a compact supported-file note, while preserving the existing import control and asset workflows in Media Library.
- [x] Validate theme palette guard, web lint, web typecheck, and optimized web production build after the shell/font changes.
- [x] Confirm the existing Next.js dev server on port 3000 serves the midnight-blue-purple theme and compiles current source changes through HMR; a clean production build also succeeds.
- [ ] Visually confirm the signed-in Gallery after the browser reloads the current bundle. The provided screenshot still contains the import panel absent from current Gallery JSX, and this run has no authenticated browser control.
- [ ] Complete the wider all-pages redesign and authenticated interaction review; this focused fix does not complete the full project transformation.

### Dashboard and shared visual system — reference follow-up

- [x] Apply the supplied purple-to-blue-to-cyan primary-button treatment consistently to shared primary buttons across public and workspace pages; normalize shared button sizing, radius, weight, and hover motion.
- [x] Hide the harsh sidebar navigation scrollbar while retaining scrolling; restore consistent Lucide icon proportions and readable sidebar labels.
- [x] Increase dashboard card, label, and calendar text sizes by about one pixel without scaling up the full page.
- [x] Keep the dashboard greeting team-focused and show a real weekly confirmed-publishing chart, including a zero-data state and a link to the existing Analytics page; no engagement or reach data is invented.
- [x] Reuse the supplied Instagram-gradient mark in the dashboard and existing Instagram platform surfaces.
- [x] Verify web lint, typecheck, theme guard, production build, and HTTP 200 responses for login, dashboard, Gallery, and Analytics routes.
- [ ] Check every dedicated page and the login page visually in an authenticated browser, then refine any remaining component-specific button exceptions.
- [ ] Live reach, impressions, engagement, and clicks require a social-platform insights integration; the current Instagram publishing integration does not expose those metrics.

### Calendar contrast and dashboard analytics placement — screenshot follow-up

- [x] Fix the calendar's hardcoded light surfaces that overrode the dark theme; the month grid, filters, events, segmented view control, and day detail now use the shared workspace tokens.
- [x] Move the live publishing trend into a dedicated full-width analytics card between the calendar/side modules and the content pipeline. It remains real-data-only and explains its zero state.
- [x] Apply the dashboard heading, paragraph, card-surface, and button system consistently across dark workspace modules.
- [x] Route the Analytics-page channel action through the shared primary-button system.
- [x] Revalidate web lint, typecheck, palette guard, production build, and Calendar HTTP 200 after these changes.
- [x] Inspect the running port-3000 stylesheet and confirm it serves the dark calendar rules, shared CTA gradient, and dedicated dashboard analytics section.
- [ ] Recheck the signed-in visual appearance in the user's browser. The screenshot shows the previous light calendar stylesheet; no authenticated browser automation is available from this session.

### Theme correction from dashboard feedback

- [x] Trace the screenshot's green/gold palette to persisted `teal-gold` settings overriding the new midnight-blue/violet default.
- [x] Apply the new default immediately when browser-local appearance settings are absent and migrate legacy teal/gold defaults while preserving mode, density, corners, typography, and card style.
- [x] Migrate the user's stored preference and owner-managed workspace default on theme settings reads; retain teal/gold as an available selectable preset.
- [x] Expand the migration to Forest Green and custom green-primary themes after screenshot follow-up; migrate the connected local database's two user preferences and one workspace default, then confirm all three now use midnight-blue-purple.
- [x] Verify API/web typechecks, lint, theme guard, and API/web production builds.
- [ ] Confirm the existing signed-in browser now displays the migrated palette after a full reload; no connected browser session is available here.

### Phase audit and preservation

- [x] Read the supplied master instruction and audit the project structure, feature tracker, web routes, API routes, Prisma schema, and publishing worker before editing.
- [x] Confirmed the existing application is a Next.js 16 / React 19 web app, Express 5 API, Prisma/MySQL data layer, and preserves a broad set of dedicated workspace modules. Existing modules and records remain in place.
- [x] Identified that `Notification` records existed in the schema but the publishing worker did not emit results and no notification API or workspace UI existed.

### Phase 12 — publishing notifications (implemented; authenticated runtime check pending)

- [x] Persist workspace-member notifications after a publish succeeds or reaches terminal failure; transient retries do not create misleading failure alerts.
- [x] Add authenticated, workspace-scoped notification listing and per-user read marking.
- [x] Add unread count, periodic refresh, and a responsive header notification panel with dark-theme styling.
- [x] Verify API/web typechecks, API/web lint, API build, and optimized web build.
- [x] Validate the Prisma schema and confirm the configured MySQL database reports all 13 migrations applied.
- [ ] Verify notification persistence/read state against the configured MySQL database and authenticated browser session; no authenticated session was available in this run.
- [ ] Run API unit tests; `tsx --test` could not start because Node 24 failed in `uv_os_get_passwd` with `ENOMEM` before loading test files.

### Phase 7 — Content Plan controls (implemented; authenticated runtime check pending)

- [x] Add tenant-scoped plan duplication with a new future date window and shifted suggested item dates; duplicated plans start as drafts.
- [x] Add persisted pause/resume status alongside existing draft, active, and archived states.
- [x] Add JSON export of the selected saved plan.
- [x] Verify API/web typechecks, lint, and API build after the changes.
- [ ] Verify duplicate, pause/resume, and export in an authenticated workspace session.

### Phase 10 — Calendar views and rescheduling (implemented; authenticated runtime check pending)

- [x] Add month, week, and day calendar views with period navigation.
- [x] Add drag-to-reschedule for scheduled posts while preserving the post's local publish time and configured time zone; invalid daylight-saving local times are rejected with an explanation.
- [x] Add a workspace-scoped reschedule API that checks the post and queued target jobs, updates both in one database transaction, and rejects jobs that have started or need attention.
- [x] Add live platform and publishing-status filters using the actual records already loaded by the calendar.
- [x] Verify API/web typechecks and lint.
- [x] Verify API build and web production build for calendar views, rescheduling, and filters.
- [ ] Verify drag-and-drop behavior and queued job execution in an authenticated browser session.
- [ ] Add content-type and campaign filters; the current post/calendar model does not expose those associations. Add post editing and approval actions in calendar.

### Remaining requested phases

- [ ] Complete open items in the audit below and the earlier checklist; this continuation does not represent the full master brief as complete.
- [ ] Run authenticated account deletion, scheduling, and demo publisher end-to-end checks using isolated test data.
- [ ] Finish broad public/authenticated dark-mode contrast review across all theme presets.
- [ ] Continue incomplete platform OAuth/publish adapters, design/import/analytics durable queues, inbox integrations, analytics snapshots, strategy authoring, content editing, and video capabilities listed below.

The requested logged-in tool is being built in batches. This tracker distinguishes working, database-backed features from placeholders and external integrations that still need implementation or credentials.

## Requested completion work — dark-mode audit and authenticated E2E (in progress)

### Batch 1 — dark palette token contrast

- [x] Measure semantic text/action/sidebar token contrast in dark mode across all eleven presets. Found Teal and Gold secondary text at 2.51:1 against its page background; raised the token to `#AFCAC7`.
- [x] Add a prebuild WCAG AA regression check for the corrected Teal and Gold dark-mode secondary text token.
- [ ] Audit every public and authenticated app page in dark mode with all eleven presets; fix page-specific unreadable text, incorrect colors, and low contrast.
- [ ] Run authenticated end-to-end account-deletion coverage using an isolated test account and verify ownership/data-retention safeguards.
- [ ] Run authenticated end-to-end scheduling and demo-publisher coverage; verify queued job completion and recorded demo result.

## Theme engine redesign — Batch 1

- [x] Add selectable color presets (including Midnight Black `#100D1C` and Electric Purple `#A855F7`), custom primary/accent colors, light/dark/system modes, and live preview. Teal-and-gold was the previous default; midnight-blue/violet is now the default.
- [x] Add user preferences and owner-managed workspace defaults with a per-user override; additive nullable JSON fields are migrated on the configured local MySQL database.
- [x] Add Appearance controls for sidebar style, density, corners, type pairing, and card treatment, plus WCAG AA contrast warnings for custom/preset colors. Apply the selected font pairing across web UI text and appearance controls across the shared web product styles.
- [x] Automatically save preference edits and preserve pending choices across navigation/reload; reuse the cached saved theme across public and logged-in web routes rather than resetting to defaults when a workspace shell mounts.
- [x] Remove the fixed app-shell palette and use shared semantic tokens for primary actions and common workspace controls. Add a prebuild check for core token defaults and hard-coded app-shell colors (except the white logo-preview canvas).
- [x] Validate web/API typecheck, web/API lint, web/API builds, the palette prebuild guard, and all 78 API tests. Confirm the local database migration is applied and API readiness returns HTTP 200.
- [x] Inspect Settings at desktop and mobile widths with Playwright: ten presets, five/two-column grids, owner controls, saved preference interactions, contrast warnings, teal sidebar, and no horizontal overflow. Authenticated API persistence was not exercised in this browser session; visual/API UI checks used a mocked owner response because the browser had no sign-in session.
- Stored appearance preferences are applied throughout the web product; authored artwork and social-platform brand colors remain intentionally independent. Transactional email, invoice, and exported-creative styling are not controlled by a per-user interface theme.
- This batch supersedes the earlier white-and-blue dashboard-theme notes in the Navigation shell section.

## Guided setup, template catalog, and account controls

- [x] Require a brand name, industry, offer, audience, tone, goals, preferred platforms, at least one valid brand color, and a font before the workspace shell or creation APIs become available.
- [x] Route signed-in users with an incomplete brand foundation to onboarding; successful completion leads to the dashboard's ordered create → review → gallery/publish workflow.
- [x] Expand each of the 14 built-in formats to 60 named template choices; templates render in per-format browse shelves and can be filtered into the full format list.
- [x] Add a distinct Gallery collection with explicit move-back controls for designs, content, rendered videos, and imported files; the top-bar shortcut opens Gallery, while Media Library remains available separately.
- [x] Add account deletion with current-password and confirmation checks. Workspace data is retained; an owner must transfer ownership first. Team settings now support ownership transfer. Reseller owners must contact support to transfer that ownership.
- [x] Include account identity and password-change controls under Settings. Password updates verify the current password and revoke other refresh sessions.
- [x] Standardize action alignment for template and content-plan cards, clamp long template/plan titles, and improve dark-surface text contrast for the new controls.
- [x] Keep the public How it works page and use theme-aware dark-mode surfaces and text for its navigation, headings, cards, and callouts.
- Gallery is a workspace collection, not a mirror of the browser's download folder. Browser downloads continue to use the browser's normal download location.

## Cloudflare Workers AI generation and avatar upgrade

This section supersedes earlier provider/fallback notes below.

1. **Audit and remove fake generated copy — complete for the runtime path.** Removed the social-content demo generator and the Idea to MP4 demo-plan generator. The seed no longer creates a fictitious sample company profile. Existing workspace records are preserved; visual composition templates remain because they provide layout metadata, not generated copy.
2. **Cloudflare Workers AI-first text generation with optional Groq and OpenAI fallbacks.** Create, Campaigns, platform-caption regeneration, competitor analysis, layout planning, and Video Studio use the account-scoped Workers AI API, then configured Groq and OpenAI fallbacks. Providers validate output and failed requests never save fallback drafts. OpenAI usage may be billable. Fallback does not bypass workspace trial/subscription or generation limits, and this chain does not provide publishing fallback. Marketing Brain recommendations and the seasonal calendar remain deterministic planning metadata, not generated captions or scripts. AI-generated replies are separate integrations.
3. **Text auto-fit — partial.** Shared SVG text now wraps long tokens and scales to fit its layer dimensions; a long-headline regression test was added. Video scene headlines are validated at six words maximum. Browser-wide overflow testing across every format and aspect ratio remains open.
4. **3D avatar — procedural renderer implemented and MP4-smoke-tested.** Added original, distinct cartoon people with skin tones, hairstyles, outfits, faces, blinking, body movement, gestures, and syllable-timed mouth movement during measured dialogue intervals. Cloudflare Workers AI casts two or three characters for each new Idea to MP4 plan; an illustrated compatibility option remains. Text-only renders now time dialogue for visible subtitles and speaking animation. These are stylized procedural characters, not photorealistic footage or phoneme-accurate lip sync.
5. **Voice, subtitles, and MP4 — existing local workflow retained.** Piper, measured dialogue clips, burned-in captions, background rendering, progress, preview/download, music mixing, silence checks, and duration checks exist. Paid TTS providers, cost estimates, per-character tone previews, and a full audio acceptance suite remain incomplete.
6. **Avatar dialogue — implemented for Idea to MP4.** Cloudflare Workers AI plans a two- or three-character cast with alternating dialogue; the render API routes each speaker to a separately selectable Piper voice. Users can choose 3D or illustrated animation. Avatar Studio, saved character selection, and phoneme-accurate lip sync are not implemented.
- Existing videos from the classic scene workflow do not acquire the new characters when retried; Video Studio now labels these older renders and links to the Idea to MP4 flow for creating a new cast video.

## Professional video batches

### Batch 1 — Audio-driven timing (core verified; regeneration still open)

- [x] Generate six-turn A/B/C dialogue with short conversational lines and per-line emotion, pace, volume, energy, and pause direction.
- [x] Synthesize local Piper lines at a measured conversational pace; trim leading and trailing silence, probe each clip with FFprobe, and build captions/audio from measured durations instead of fixed scene padding.
- [x] Remove the speech-overrun hard failure for existing scripts. The renderer now automatically fits longer narration to the scene and supports chained FFmpeg tempo filters rather than rejecting the job.
- [x] Keep turn gaps short, allow only explicitly marked and bounded pauses/overlaps, and add a short visible-action tail; narrated renders use a quiet local music bed under speech, action beats, and the end card.
- [x] Probe the final MP4 and run FFmpeg `silencedetect`; fail renders with silent gaps over one second or duration drift over three seconds.
- [x] Rendered the HASNA salon example (Pune customer and owner, booking-phone interaction, waiting area, counter, and happy ending). Verified final duration **61.83 seconds** for a 60-second target; independent `silencedetect` measured no gap over **0.41 seconds**.
- [ ] Automatically regenerate an out-of-tolerance screenplay and return it for review; current behavior fails the render with a plain-language correction message rather than silently padding or changing the approved script.

### Batch 2 — Natural conversation and voice tone (partial)

- [x] Add screenplay direction fields and local Piper pacing controls.
- [ ] Add OpenAI and ElevenLabs speech providers, per-character tone/voice previews, cost estimates, loudness normalization, and richer sound mixing.
- [ ] Validate natural English, Indian English, and Hinglish dialogue against representative scripts.

### Batch 3 — Avatar Studio (not started)

- [ ] No saved character library, workspace character API/model, Avatar Studio page, artwork import, or avatar export is implemented yet.

### Batch 4 — Directed scene quality (not started)

- [ ] No five-industry visual/audio acceptance suite has been run. The verified sample still shows a setting label and does not yet meet the requested 40%-of-frame character-height target.
- The renderer creates original 2D illustrations; it does not generate photorealistic people or real footage.

## Batch 0 — Reliability first (in progress)

- [x] Add video-job attempts, heartbeats, timeout deadlines, retry scheduling, and cancellation timestamps to the schema and add a MySQL migration.
- [x] Recover stale video jobs at worker startup and on its schedule; retry up to two times with bounded backoff, then expose a plain-language terminal failure.
- [x] Keep guided-script voice tracks inside their requested scene durations: narrate labeled dialogue rather than visual directions, fit speech only up to 1.35x, isolate temporary audio from Remotion's render workspace, and surface safe actionable audio/duration errors after retries.
- [x] Re-render the previously failing 30-second guided video through the background worker; the saved MP4 is playable, reports 100% complete, and passed the exact-duration and audio-silence checks.
- [x] Add a 30-minute render deadline, cooperative cancellation for Remotion, Piper, FFmpeg and provider fetches, and remove temporary/partial output files after worker errors or cancellation.
- [x] Report render progress by stage and percentage through a same-origin server-sent event stream for the open job, with the existing queue polling retained as a fallback; add cancel and retry actions in Video Studio.
- [x] Add publishing-worker heartbeats, startup recovery, and a three-attempt maximum (initial attempt plus two retries).
- [x] Add an owner/admin-only System Status page and API checks for database, disk, FFmpeg/FFprobe, Remotion's managed Chromium cache, Piper/model availability, the optional Rhubarb executable, music assets, AI/image configuration, and connected Instagram token validity.
- [x] Run core database, disk, video-tool, Piper, and music checks at API startup without preventing the API from serving requests when an optional dependency is missing.
- [x] Centralize browser requests with two retries for safe reads, 120-second default and five-minute upload timeouts, corrected workspace/brand headers, and binary upload content types.
- [x] Add a shared offline/API connection banner and a page-level error boundary with retry and dashboard recovery actions.
- [x] Replace the build-time API rewrite with a same-origin runtime proxy that preserves authentication cookies and streams uploads/downloads. Live probing confirmed the API responds directly while the deployed web `/api/*` paths returned Next.js 404 pages; local proxy checks now reach the API and return its expected 401 for unauthenticated requests.
- [x] Apply the additive migration to the verified local `united_technologies` database, confirm Prisma reports the schema up to date, and verify `/health/ready` returns `ok`.
- [x] Add a route-map test that verifies every sidebar destination resolves to its own page or the dedicated section fallback and confirms Analytics, Video Studio, and System Status have dedicated routes.
- [ ] Finish authenticated browser review and route smoke coverage. The local browser session is unauthenticated, so protected screens and the System Status cards have not been verified in a signed-in browser.
- [~] Chromium managed-cache and optional Rhubarb executable checks are now visible in System Status. Explicit memory/resource safeguards and worker failure-injection/20-video/50-design soak tests remain incomplete and have not been claimed. Prisma client can query the newly migrated fields locally, and the active API readiness endpoint is healthy.
- [ ] Design rendering, import processing, and analytics sync currently do not have durable background queues; keep those statuses explicit rather than claiming they share the video/publishing worker state machine.

## App tool prompt

### Public website and app-shell refinement
- [x] Add shared public navigation and dedicated Features, How it works, Pricing, About, and Contact pages.
- [x] Improve public-site contrast, readable type, mobile navigation, and restrained card hover lighting.
- [x] Correct app theme contrast, simplify workspace and brand controls, and standardize typography and tool sizing.
- [x] Install the supplied United Technologies logo mark and keep the dashboard sidebar free of manually added company/product text.
- [x] Center the logo mark in a large white sidebar tile, remove workspace and brand selectors, and move theme selection into the sidebar.
- [x] Replace the navigation search modal with inline search results; remove the notification bell and duplicate profile-menu Settings link.
- [x] Place account email and name in the top-bar profile, keep only Sign out in its menu, and improve trial-banner visibility.
- [x] Refresh and retry protected API requests once after an expired access token; redirect to sign-in if the session is no longer valid.
- [x] Keep public pricing and support copy transparent about rates, billing, and contact details that are not configured.
- [x] Established a professional white-and-blue dashboard baseline (superseded by the Theme engine redesign — Batch 1 above).

### Batch 1 — Navigation shell
- [x] Grouped navigation for all requested workspace and admin sections.
- [x] Responsive shell, selector-free workspace navigation, inline search results, account menu, and trial countdown. The sidebar theme switch was expanded by the Theme engine redesign — Batch 1 above.
- [x] Add tailored pages, contextual workflows, and transparent integration states to every sidebar route.
- [x] Authenticated workspace selection and shared shell for the dashboard and brand profile.

### Batch 2 — Create
- [x] Cloudflare Workers AI content-provider interface with strict response validation and Groq/OpenAI fallback providers.
- [x] Generate post, carousel, story, poster, brochure, flyer, thumbnail, video script, and additional template formats in multiple languages.
- [x] Create three distinct style directions for flexible designs; selected-template generation creates one matching design. Refine/regenerate and inspect platform previews.
- [x] SVG, PNG, JPG, and browser print-to-PDF export; generated content counts against the plan limit.
- [x] Generated drafts can be reviewed and captions edited before a user explicitly schedules or publishes them; no action is taken automatically.

### Batch 3 — Content engine
- [x] Content library with brand, format, platform, and status filters; detail, edit, duplicate, delete, regenerate, and refine actions.
- [x] Tenant-scoped persistence for generated content and its design variants.
- [ ] Content pillars/idea planning, first-comment variants, and platform-specific caption generation remain incomplete.

### Batch 4 — Design engine and library
- [x] Seeded 42 global templates spanning posts, stories, carousels, flyers, video formats, Indian festivals, offers, and other requested categories.
- [x] Template search/filter and selection wired into Create; selected template is recorded on generated designs.
- [x] Designs library with brand/status filtering, preview, PNG/JPG/PDF/SVG export, duplicate, and delete.
- [x] Group generated layout variations into one Design Set, switch between its previews, and add design search, platform filtering, and browser-saved favorites.
- [~] Batch A foundation: add a versioned shared design-document format and deterministic SVG renderer; use it for new generated previews, template thumbnails, design-library previews, scheduled media, and Remotion scene typography/layout.
- [x] Apply the exact selected template to the saved preview and generated copy; save one design for a selected template rather than three redundant variants.
- [x] Generate connected 5–6-slide carousels as navigable multi-page designs with page-by-page or multi-page PDF export.
- [x] Remove arbitrary character limits from creative briefs, visual directions, scene narration, captions, content refinements, review notes, and brand-profile text; migrate brand-profile strings to MySQL `TEXT` columns.
- [x] Lay out flyer copy in three columns and brochure copy in six panels across a two-sided tri-fold; expand starter designs to twelve visibly different treatments, including radiant and sparkle styles.
- [x] Give each of the twelve template treatments a distinct headline composition and typography placement; use responsive card grids rather than horizontal-scrolling template rails.
- [x] Open carousel designs in an arrow- and keyboard-navigable preview from Create, Designs, and Media Library; group export formats under a visible blue Download button.
- [x] Use the United Technologies logo as the browser-tab icon.
- [x] Convert legacy saved design JSON into the shared format when read, without rewriting or deleting existing records; keep the selected template ID and layout on its matching saved design.
- [ ] Full renderer parity for rich text/effects, image manipulation, vector/icons, QR codes, print export, multipage output, and bundled fonts remains to be implemented with the editor.
- [ ] Current layout/preview renderer is a lightweight SVG renderer. Server-side high-resolution rendering, multi-page PDF, complete typography fitting, and measured contrast checks remain incomplete.
- [ ] Real image-generation provider is not configured.

### Batch 5 — Videos
- [x] Add an Idea to MP4 workflow with a short business brief, duration, language, format, selectable conversation treatment, provider indicator, editable plan review, profile branding, and explicit render action; never auto-post.
- [x] Generate strict industry-aware scene plans in an outline and five-scene chunks, validate/retry JSON and timing, retry provider rate limits, and use a Cloudflare Workers AI → Groq → optional OpenAI text-provider chain.
- [x] Generate a two-character conversation with an editable original cast, alternating lines, separate Piper voice choices, and per-line subtitle/talking states.
- [x] Draw conversational scenes as original local sphere-character vector rigs with mouth movement, gestures, listener reactions, props, varied settings, and exact-length background MP4 rendering.
- [ ] Full cinematic 3D animation and phoneme-accurate lip sync are not supported by this free local Remotion/SVG renderer; Blender is not installed.
- [ ] A dedicated social-handle field is not present in the profile schema; Idea to MP4 can use the connected account's display name but cannot guarantee a canonical @handle.
- [ ] Photorealistic people, generated SVG artwork, and real footage are not supported by Idea to MP4; it uses safe, locally authored sphere characters and illustrated scenes. It does not publish automatically.
- [x] Video scripts and scene lists are generated with content; the Video Studio exposes language, voice provider, voice, video aspect ratio, and background music controls.
- [x] Remotion templates render vertical, square, and landscape H.264 MP4 video with brand colors/fonts/logo, animated headlines, scene fades, burned-in narration captions, and a branded logo end card.
- [x] Animate scene headlines word-by-word from alternating directions and add moving geometric accents behind the narration captions.
- [x] Add locally rendered vector scene illustrations selected from narration context, with animated people and scene elements for healthcare journeys, automated workflows, business scenes, and a general fallback.
- [x] TTS adapter interface supports OpenAI, ElevenLabs, and offline Piper; automatic provider selection uses configured APIs first and Piper otherwise. Per-scene narration duration controls scene timing; text-only mode remains available.
- [x] Royalty-free music manifest and original synthesized ambient sample; music preview, volume, and narration ducking controls.
- [x] Generated gradient backgrounds by default; optional Pexels photo/video visuals when `PEXELS_API_KEY` is configured.
- [x] Tenant-scoped MySQL video render queue with progress, failure reporting, MP4 streaming/download, Media Library persistence, regeneration, scene-text editing, and queue scheduling.
- [ ] Live video publishing to social platforms remains provider-dependent; current platform publisher adapters do not upload rendered video files.
- [ ] Photoreal AI-generated people/character scenes are not included; the no-paid-API option uses original stylized vector illustrations rendered locally with Remotion.

### Batch 6 — Social accounts and publishing
- [~] Simulated demo publishing, MySQL job queue with conditional locking, retries, fake platform IDs, and queue UI.
- [ ] Platform OAuth, encrypted tokens, real adapters, reconnect states, and live results.

### Batch 7 — Calendar, plans, and approvals
- [~] Scheduling, timezone storage, list views, cancellation, and retry UI are wired.
- [x] Add month/week/day calendar views and transactional drag-to-reschedule for queued posts.
- [ ] Calendar filters, detailed post editing, approval actions, content-plan-to-calendar integration, and broader activity history remain incomplete.

### Batch 8 — Media, brand kit, team, billing, settings
- [ ] Media uploads and folders, complete brand-kit editing, team invitations/permission enforcement, billing, invoices, and settings.

### Batch 9 — Inbox, analytics, listening
- [ ] Inbox replies/assignment, analytics snapshots and exports, listening, reports, and performance-informed planning.

### Batch 10 — Super-admin
- [ ] Customer/plan/request/reseller management, exports, suspension/trial actions, and audit-safe impersonation.

## Validation completed

- Idea to MP4 validation passes all 64 API tests, API/web lint, typecheck, and production builds, plus `git diff --check`. A local 15-second smoke render completed with two Piper voices and produced an exact-duration H.264/AAC MP4; the temporary MP4 was removed after probing. The live AI provider request and full 1–5-minute queued UI flow were not exercised.
- The two-character dialogue plan, editable spherical cast/dialogue, selectable conversation treatments, full-frame vertical scene composition, original local sphere animation, per-speaker Piper audio, timed subtitle placement, and varied setting backgrounds are wired. A local 15-second MP4 smoke render verified H.264 video, AAC audio, and exact duration. Full cinematic 3D, photorealistic people, real footage, and live interactive conversation remain unsupported.
- Latest sign-in/UI correction: live API `/health/ready` returns 200, but the deployed web `/api/auth/me`, `/api/workspaces`, and `/api/auth/refresh` returned Next.js 404 HTML while direct API auth returned JSON. Replaced the build-time rewrite with a runtime same-origin, cookie-forwarding streaming proxy; local auth and upload proxy checks return the API's expected JSON 401. Web typecheck/lint and production build pass; white login, analytics calculations/theme colors, and device-import contrast were updated.
- Latest Batch 0 verification: Prisma Client regenerated successfully after the local migration; API build and lint pass, all 53 API tests pass, web typecheck and lint pass, and `git diff --check` is clean. The restarted local API completed 5/5 startup preflight checks, Prisma reports the schema up to date, and `/health/ready` returns `ok`. Browser review of System Status redirected to sign-in after the API returned 401, so authenticated UI checks remain incomplete.
- Latest web lint and production build pass; the build's TypeScript check passes. The home page and all five public routes return HTTP 200.
- Browser checks verified the mobile navigation and dashboard fit narrow screens without horizontal overflow, readable light/dark shell colors, refresh-and-retry on a simulated expired access token, and redirect to sign-in when refresh fails.
- API lint, strict typecheck, build, and automated tests pass, including music manifest and TTS adapter tests.
- Web lint, strict typecheck, and production build pass.
- The Designs page rendered one generated item as a single set with three selectable layouts; browser checks confirmed the light and dark theme color values.
- Shared design-document tests cover dimensions, exact selected layout/palette stability, malformed documents, safe SVG text encoding, and the video end card.
- API tests cover actual carousel page content, three-column flyer and six-panel brochure output, slide-count validation, and twelve distinct starter layouts. Create and Designs now expose page navigation and export actions in the dashboard.
- A real Video Studio render completed with offline Piper narration and the included ambient track. FFprobe verified a 30.17-second H.264/AAC MP4 at 1080 x 1920; audio analysis confirmed a non-silent signal. The job reached 100%, and its Media Library entry and browser video preview loaded successfully.
- Remotion now bundles into an explicit per-job local directory and validates that exact path before selection and rendering; it rejects web origins such as the Next.js app URL. A post-restart render reached 100%; FFprobe confirmed H.264/AAC at 1080 x 1920 and audio analysis measured a non-silent signal. The browser loaded the video preview with ready video dimensions.
- After integrating the shared design document into Remotion and restarting the API, a 7.6-second vertical sample rendered successfully. FFprobe confirmed 1080 x 1920 H.264 video and AAC audio; FFmpeg decoded both streams and measured non-silent audio.
- The prior API test suite passed 23 tests, including FFmpeg audio mixing, music ducking, and Remotion local-bundle path guards. The obsolete failed render record was deleted; successful render records were retained.
- Latest design-workflow validation: API lint/typecheck/build pass and all 28 API tests pass; web lint/typecheck/production build pass. The white-and-blue shell was inspected in the browser, and dashboard routes return HTTP 200. This browser session is signed out, so authenticated template generation and library data were not exercised in the browser.
- Prisma migration status is up to date; migration shadow-database ordering was repaired and verified with `prisma migrate dev`.
- Demo seed is idempotent and installs 42 templates.
- Authenticated API smoke tests verified template retrieval, template-backed generation, design duplication/deletion, generated-content cleanup, immediate demo publishing, future scheduling, and cancellation against local MySQL.
- Earlier browser smoke tests exercised login, Create generation, and Content library. The browser test session later expired; the latest Templates/Designs UI was validated by build and API smoke tests, not a post-change authenticated browser session.
- Video Studio guided-flow retains the guided-script editor, sample input prompts, minute/second controls, and editable storyboard. Sample prompts populate only the input field; generated scripts require an AI provider and user review.
- Validation of this update: API typecheck/lint/build and web typecheck/lint pass; all 54 API tests pass, including the focused generator, renderer, and job-state coverage. An authenticated browser review was not possible because the available local browser session redirects to sign-in. These changes do not complete the requested character-animation, multi-speaker dialogue/lip-sync, exact-duration FFprobe, generated-music-library, soak-test, or eight-industry sample gates.
- Follow-up from the local Video Studio screenshot: successful Instagram deletion-sync polls now clear a prior transient API error even when no posts were deleted, and a failed poll retries after 15 seconds (in addition to the five-minute poll). Duration controls and saved script values now clamp to the valid 15-second-to-5-minute range, preventing a zero-second target. API readiness currently returns HTTP 200; authenticated browser validation remains unavailable in this session.
- Added a dedicated **Import files** item to the left navigation. It opens the existing upload and imported-assets workflow, prefiltered to imported files, with a link back to the full Media Library. The import action and supported file handling are reused; no duplicate upload flow or storage behavior was introduced.
- Gallery and Media Library now maintain separate per-asset locations. Moving an asset between them does not duplicate or delete its workspace record.
- Create, Campaigns, platform regeneration, and Idea to MP4 use Cloudflare Workers AI first through its account-scoped API and use configured Groq/OpenAI providers when it fails. Credentials stay server-side; missing providers and exhausted retries fail visibly without demo drafts.

## Known limitations

- Cloudflare Workers AI is the default text-generation provider with optional Groq and OpenAI fallbacks. Historical records created by earlier demo/provider paths are preserved and are not represented as newly generated content.
- Preview layouts and image exports are rendered by the built-in SVG engine. PDF export uses the browser print dialog; carousel sets support multi-page PDF, while server-generated print files and full editor-level export parity remain incomplete.
- Social platform approvals, OAuth credentials, payment keys, and media services were not supplied. Those features are not presented as live integrations.
- Replace the documented `example.com` support/domain placeholders before launch.
- Idea to MP4 now measures local Piper dialogue clips, trims leading/trailing silence, uses variable line timing, and rejects final MP4s outside the requested duration tolerance or with detected silent gaps over one second. The HASNA 60-second smoke render measured 61.83 seconds and no silence gap over 0.41 seconds. Paid TTS providers, Avatar Studio, the requested character-scale/scene-heading refinements, six-industry visual/audio review, and render soak testing remain incomplete.
- `npm audit` has reported high-severity issues in Prisma 6's development-only dependency tree; upgrading Prisma is a separate breaking-change task.

## Marketing workflow product batches

### Batch 1 — Marketing Brain (core available, limited local context)

- [x] Add workspace-scoped business context from the brand profile, brief, recent content, and available numeric analytics; state explicitly when analytics are unavailable.
- [x] Add deterministic publishing-gap, content-mix, cadence, and profile-goal recommendations with accept, snooze, dismiss, and audit history.
- [x] Add the Marketing Brain page, dashboard entry, and limited-data messaging.
- [x] Add a small versioned local industry-guidance cache and dated seasonal moments, with optional campaign-draft links.
- [ ] This is not live/external market research, a comprehensive events calendar, or claim verification; validate dates, sources, audience fit, and platform guidance before use.

### Batch 2 — Platform content sets (partial)

- [x] Centralize platform caption targets, recommended formats, image ratios, and official documentation links in `packages/shared/src/platform-specs.ts`.
- [x] Show editable platform-specific captions and guidance in Create; regenerate one platform through the active provider and plan generation limit.
- [x] Save a reviewed post to Posts as a draft without creating publish jobs; schedule and immediate-publish remain separate explicit actions.
- [x] Edit and persist platform hooks, caption, title/description, CTA, alt text, format guidance, image ratio, template suggestion, and first comment in a tenant-scoped Content Set.
- [x] Pass platform-specific copy to each post target. Providers receive channel guidance and are instructed to produce distinct, platform-native versions.
- [ ] Confirm every configured limit against current official documentation before treating it as a guaranteed platform acceptance rule. The config describes conservative editor targets and links to official help pages.
- [ ] Field-specific regeneration, one-click tone/length transforms, and authenticated save/reload/reuse browser validation remain incomplete.

### Batch 3 — Pre-publishing quality checks (deterministic core implemented)

- [x] Add an on-demand quality-check endpoint and Create UI with a score/severity report for per-platform caption length, missing copy, hashtag recommendations, missing CTA, duplicate copy, emoji overuse, placeholders, and common unsupported absolute claims.
- [x] Add brand-profile voice rules and banned words; apply banned-word checks at on-demand review, scheduling/immediate publishing, and approval submission.
- [x] Check quality before scheduling/immediate publishing and before submitting a draft for approval. Blocking errors require an override reason; overrides are written to the workspace audit log.
- [ ] Configurable strictness, broader claim policies, live-link validation, accessible-media and platform-dimension checks, AI review, and one-click repairs remain incomplete.

### Batch 4 — Content plans (basic workflow implemented)

- [x] Add tenant-scoped content plan list/create/status APIs and a dedicated Content Plans screen.
- [x] Save campaign goal, audience, platform set, date range, suggested dates, and references to generated content drafts.
- [x] Duplicate/export/pause controls for persisted plans.
- [ ] Full 30-day pillars/funnel strategy, per-platform playbooks, calendar editing, item approvals, ask-first preferences, and analytics-informed optimization remain incomplete.

### Batch 5 — Campaign generation (basic workflow implemented)

- [x] Add a Campaign Builder that uses the configured AI provider for a multi-format, multi-platform draft set and saves it to Content Plans.
- [x] Keep generation and plan creation separate from scheduling or publishing; generation never schedules or publishes automatically.
- [x] Retry temporary provider HTTP 429/503 responses; return a clear error with no fallback drafts if all configured providers remain unavailable.
- [ ] Campaign records/phases/assets, per-format regeneration, tracked links, campaign editing, ZIP export, approval/scheduling end-to-end, and strategic calendar automation remain incomplete. Auto-scheduling is not enabled.

### Batch 6 — Social feed previews (illustrative preview only)

- [x] Add expandable per-platform feed mockups in Create with each platform's configured ratio target and caption.
- [ ] A dedicated multi-surface/device/light simulator, safe-area overlays, accurate connected-profile details, saved-media previews, and drag-to-schedule are not implemented. Current previews are not pixel-accurate.

### Verification for Marketing workflow batches

- Earlier baseline: 83 API tests passed before the primary-provider refactor. The current provider validation result is recorded in the section at the top of this file.
- API/web lint, strict typechecks, and production builds passed; `git diff --check` is clean.
- Prisma Client was regenerated; the two additive Content Sets/brand-voice migrations were applied with `migrate deploy` without resetting the local database. Prisma reports the schema up to date.
- Local API `/health/ready` and web `/` returned HTTP 200. The browser workspace is signed out and protected API requests return the expected 401, so populated-page visual review and authenticated create/plan/content-set flows remain unverified.
- The new Campaigns and Content Plans page routes returned HTTP 200 from the local web server. `/api/health/ready` is not a valid proxied path; the API health route is `/health/ready`.

### Batch 7 — Content plan execution workflow (implemented; end-to-end account run still required)

- [x] Add a tenant-scoped `POST /content-plans/:id/execute` route with plan/item ownership checks, future-date validation, existing brand banned-word quality checks, an audit record, and serializable execution to prevent duplicate plan runs.
- [x] Add an explicit **Send to approvals** action. It creates scheduled-date draft posts and draft targets with pending approval records, without creating publish jobs.
- [x] Add an explicit **Schedule live Instagram** action. It creates real queued publishing jobs only when an Instagram account is connected, every item is Instagram-only, every item has a rendered SVG design preview, and all items pass quality checks. Jobs use the workspace brand timezone.
- [x] Plans are marked as sent to the workflow after successful execution; duplicate execution is rejected. Users can still duplicate a plan to produce a new editable copy.
- [x] API and web strict typechecks and lint pass after the change.
- [ ] API automated test command is blocked before test discovery by Node 24 `uv_os_get_passwd returned ENOMEM`; no API behavior tests ran in this environment. The test suite must be rerun in a compatible runtime.
- [ ] No authenticated Instagram account and eligible future-dated plan with rendered media were available for a live scheduling smoke test. OAuth credentials, media hosting, Meta permissions, and account connection remain configuration dependencies.
- [ ] Approval review currently records the reviewer decision but does not itself create publishing jobs; approved posts still need to be scheduled in Posts. Instagram is the only live publishing adapter; other platforms remain unsupported for autonomous publishing.

### Batch 8 — Dedicated feature page theme alignment (implemented; browser review pending)

- [x] Normalize every dedicated dashboard module to the dashboard content width, responsive page padding, Inter body type, shared heading scale, dashboard text colors, and theme-aware controls.
- [x] Replace per-module card surfaces with the dashboard's shared themed panel border, gradient, radius, and shadow for creation, campaigns, plans, approvals, posts, analytics, calendar, media, templates, designs, video, social accounts, team, system status, and settings surfaces.
- [x] Extend the shared container surface to account/security cards, upload and media toolbars, publishing controls, team/member/permission panels, content preview cards, scene cards, and legacy stats/cards used by less common feature routes.
- [x] Keep the dashboard's own welcome and compact panel typography controlled by its existing dashboard styles; align the separate Appearance settings page as well.
- [ ] Browser screenshots for every dedicated route are not available in this unauthenticated session; verify populated and empty states in both light and dark modes.

### Batch 9 — Light-mode theme support (implemented; browser review pending)

- [x] Fix the midnight theme's dashboard studio tokens so panels, text, borders, sidebar, user menu, calendar, and charts follow the resolved light palette rather than retaining hard-coded dark-mode colors.
- [x] Switch the workspace top bar and billing trial banner to adaptive light surfaces; use readable light-mode accent and today text.
- [x] Change shared feature containers to semantic surface tokens so they render light surfaces in light mode and dark surfaces in dark mode.
- [x] Add build-time palette guard checks for adaptive light-mode tokens and the dashboard top bar.
- [x] Web lint, typecheck, palette guard, and production build pass. One typecheck ran concurrently with `next build` and saw a transient missing generated `.next/types/routes.js`; rerunning typecheck after the build passed.
- [ ] Authenticated visual comparison in light and dark modes remains pending because the available browser session is signed out.

### Batch 10 — Cross-page polish and video outline recovery (implemented; visual review pending)

- [x] Normalize AI-provider character cast variants into the strict video outline schema, preserving supplied appearance/personality while deriving missing values from model-specific appearance fields; add a focused regression test.
- [x] Remove the redundant dashboard approval-card “View all” action and redundant video plan retry action; the primary submit action remains available after an error.
- [x] Clarify the notification bell purpose accessibly and standardize notification badges, account-menu hover surfaces, sidebar active color, primary/secondary controls, and select arrows with theme tokens.
- [x] Align Templates, Video Studio, Analytics, Marketing Brain, onboarding country fields, and dedicated page title cues with the shared dashboard surface and typography system.
- [x] Expand the Video Studio rendered-video empty state to the full content width and present generation failures in a themed notice panel.
- [x] API and web typechecks pass; API and web lint pass; API production build passes; theme palette guard passes.
- [ ] API tests could not start: Node 24 `tsx` crashed before test discovery (`uv_os_get_passwd returned ENOMEM`). The new regression test has not executed in this environment.
- [x] Web production build passes when run with network access enabled so `next/font` can fetch the existing Inter and Playfair Display font files.
- [x] Direct compiled-module smoke check confirms missing model-specific cast details are normalized into valid renderer fields.
- [ ] Authenticated browser review, including both light/dark screenshots and confirmation of the runtime video generation request, remains pending.

### Batch 11 — Screenshot-led page corrections (implemented; authenticated visual review pending)

- [x] Put the dashboard calendar across the full content width and place the AI recommendation, approval queue, and connected account cards in one row below it; analytics follows that row.
- [x] Align Create and Campaigns selection tiles to the dashboard surfaces without bright outlines; position Create’s Surprise me action beside its brief field heading.
- [x] Simplify the Content Plans empty state and move its campaign action into the shared primary button style.
- [x] Move Gallery/Media Library navigation actions into the page action row, shorten Gallery/Library copy, and align import controls with the primary action style.
- [x] Reduce Video Studio form clutter by collapsing sample briefs and replacing long story/duration button rows with compact selects; keep advanced cards and controls on dashboard surfaces.
- [x] Split Brand Kit foundation fields and preferred template defaults into two separate themed containers; standardize title scale, country field treatment, and template selector arrow styling.
- [x] Apply the common page title scale and topic emoji glyphs with proper variation-selector escaping; remove the Designs emoji cue at the user's request.
- [x] Refresh starter template palettes to eight brighter, coordinated combinations; remove Billing and Plan from workspace navigation while retaining public pricing links.
- [x] API/web typechecks and lint pass; API/web production builds pass; template palette and video-plan normalizer direct smoke checks pass.
- [ ] API test suite still cannot initialize under Node 24: `tsx` fails before test discovery with `uv_os_get_passwd returned ENOMEM`. Authenticated visual review is unavailable in this session.

### Batch 12 - Template previews and local refresh (implemented; visual review pending)

- [x] Replace placeholder starter-template previews with format-aware sample copy for social posts, stories, carousels, flyers, brochures, event posters, banners, and other formats; carousel preview pages and print sections now use their actual format structures.
- [x] Rebuild the production web app and restart its localhost:3000 listener so the browser is served the current bundle; `/dashboard/templates` returned HTTP 200 after restart.
- [x] Web typecheck, lint, theme palette guard, and production build pass.
- [ ] Review regenerated template artwork in an authenticated browser and replace geometric illustration treatments with curated client-ready artwork where visual review shows it is needed.

### Batch 13 - Prompt-driven AI artwork (implemented; live provider generation pending)

- [x] Add a dedicated Create with AI artwork builder to Templates with format selection, a detailed visual prompt, and an optional compressed image reference; route the dashboard Create with AI action to this builder.
- [x] Add a tenant-scoped image generation endpoint using Cloudflare Workers AI text-to-image and image-to-image models, brand colors/profile context, request validation, reference-image validation, rate limiting, and the workspace monthly AI generation quota.
- [x] Save generated artwork in the existing Design/Generated Content version history and Gallery; keep generated headline, supporting copy, CTA, and brochure panel copy as separate text layers.
- [x] Add image-backed portrait flyer/social artwork and a two-sided landscape brochure with tri-fold panel proportions; add saved text-layer editing in Designs.
- [x] Configure Cloudflare Workers AI text, image, and reference-image model IDs in the API environment; model generation now reports Cloudflare errors explicitly.
- [x] Distinguish local request throttling from provider 429 quota/rate errors in the API and provide provider-specific recovery guidance.
- [x] API/web typechecks and lint pass; API build and web production build pass; theme palette guard passes; direct runtime smoke check verified the flyer canvas, two-sided brochure canvas, prompt content, and artwork layer.
- [ ] The focused Node/tsx unit test is blocked before discovery by Node 24 `uv_os_get_passwd returned ENOMEM`; no additional live image-generation request was sent. Authenticated browser review of generated artwork remains pending until provider quota is available.
- [x] Restarted the local API/web services after final changes; `/health/ready` and `/dashboard/templates` return HTTP 200, and the compiled web bundle includes the AI artwork builder and text editor.

### Batch 14 - Image-generation error visibility and local service recovery

- [x] Trust only loopback as the local reverse proxy so API rate limiters can use forwarded request addresses without trusting arbitrary public proxies.
- [x] Preserve a redacted, bounded Google provider error in API logs and return actionable error categories instead of incorrectly telling users to rewrite their prompt for every provider failure.
- [x] API strict typecheck, lint, and production build pass; restarted the API and web production servers in persistent sessions with outbound API access; `/health/ready` and `/dashboard/templates` both return HTTP 200, and the web-to-API proxy returns the expected unauthenticated 401 instead of a connection error.
- [x] Diagnosed the screenshot's `fetch failed` as restricted outbound networking in the initial API process (`EACCES`); verified a no-credential request can reach Google's API host from the network-enabled API runtime.
- [ ] A successful live image-generation request remains unverified; the Google image model may still require project billing/quota, and another request may consume provider credits.

### Batch 15 - Groq-powered vector artwork

- [x] Prefer the configured Groq key for Create with AI; use Groq to produce structured SVG illustration plus editable campaign copy, with an optional style-reference image.
- [x] Sanitize Groq SVG output, reject scripts/external image references, rasterize to the existing saved design workflow, and preserve flyer/brochure layouts and editable copy layers.
- [x] Update artwork status and error messaging to identify Groq and its quota link; explain that Groq produces vector artwork while photorealistic image generation requires a dedicated image model.
- [x] API/web typechecks and lint pass; API/web production builds pass; local SVG smoke check rasterized a flyer canvas and rejected unsafe SVG.
- [ ] Formal test discovery still fails under Node 24 (uv_os_get_passwd returned ENOMEM); the Groq live API was not called to avoid consuming account quota.
- [x] Restarted local API/web builds; API health and Templates page return HTTP 200, and the web-to-API proxy reaches the authenticated API route.

### Batch 16 - Onboarding schedule and first content plan

- [x] Add a publishing time-zone selector to brand setup and persist it through the existing brand-profile API.
- [x] On first completion of the brand profile, use the existing content generator to create a post, carousel, and story for the chosen platforms, then save those drafts in a first-week Content Plan at 10:00, 14:00, and 18:00 in the selected IANA time zone.
- [x] Keep first-run automation reviewable: drafts and suggested dates are saved, but no connected social account is published to automatically.
- [x] Restore the blue-purple-cyan primary action treatment for sign-in and workspace primary buttons, set the blue-indigo sidebar hover for the midnight preset, and normalize select controls to semantic theme surfaces.
- [x] Web typecheck, lint, palette guard, and production build pass; restarted the web server.
- [ ] First-run generation with a newly signed-up account has not been run against a live authenticated workspace; it uses existing provider credentials and, during an active trial, is not subject to an app-level monthly AI generation quota.
- [ ] Ongoing scheduled generation, editable cadence/day/time preferences, automatic design image generation for all post formats, and unattended cross-platform publishing remain incomplete. Live publishing still depends on connected-platform permissions and remains behind the existing explicit workflow.

### Batch 17 - Approval-gated first-week automation (implemented; external delivery/live account setup pending)

- [x] On first brand-profile completion, generate five Instagram feed posts (three single-image posts and two carousels) across five days using the brand time zone; execution creates pending approvals rather than publishing jobs.
- [x] Require Instagram to be a preferred platform for the first-week plan; do not route the automated plan to other channels that have no live publisher.
- [x] Preserve carousel slides when a plan is executed so an approved Instagram carousel is published as a carousel instead of a single cover image.
- [x] Send a grouped email preview as scheduled posts enter the next seven-day window, grouping by workspace and time zone so the email covers every date in the upcoming batch. Provide one secure batch review page with approve-all/request-changes actions; unanswered approvals remain on hold and receive reminders every 12 hours until their scheduled time.
- [x] Keep legacy single-post approval links working and continue recording approval decisions in audit logs.
- [x] Add the approval review page and link it from email; show generated artwork, caption, channel, and scheduled time.
- [x] Make primary action gradients derive from theme accent/action tokens so saved color themes apply to buttons.
- [x] Apply additive approval-token database migration; Prisma generation, API/web typechecks, lint, and API/web production builds passed. API readiness and approval/calendar page smoke checks returned HTTP 200; invalid/unknown approval tokens return the expected expired response.
- [ ] Configure Gmail (`GMAIL_USER` and `GMAIL_APP_PASSWORD`) or Resend in `apps/api/.env` to deliver batch approval emails and reminders.
- [ ] Connect an Instagram publishing account and configure its OAuth/public callback settings for real publishing; other platform publishing adapters are not live.
- [x] Superseded by Batch 20: implement recurring 13-post weekly Instagram batches with two automatically rendered Reels.
- [ ] Derive posting-time recommendations from live Instagram performance data and validate an authenticated end-to-end run. Durable video storage and always-on worker hosting are also still required for production reliability.

### Batch 20 - Recurring Instagram Autopilot (implemented; deployment validation pending)

- [x] Add an opt-in Instagram Autopilot profile setting with a database-backed recurring run record and idempotent generated-content keys.
- [x] Generate 13 Instagram items per weekly run (11 static-format creatives and two 60-second vertical Reels), render Reels through the existing video worker, and build a time-zone-aware schedule with three posts on Monday through Wednesday and two on Thursday and Friday.
- [x] Wait for both video renders before creating the weekly Content Plan; create the scheduled posts as pending approvals, not publishing jobs.
- [x] Include a signed, expiring Reel video preview on the batch-review page; preserve the existing batch approve/request-changes behavior and hold unanswered posts.
- [x] Add prerequisite checks for a connected Instagram account, Gmail or Resend email settings, public HTTPS media hosting, and the social-token encryption key; persist and surface failed-run status.
- [ ] Apply the new database migration and regenerate Prisma Client. Generation is currently blocked because the existing API process is using the Prisma Windows query-engine DLL; do not stop that running process without authorization.
- [ ] Run API/web typechecks, lint, focused tests, and production builds; validate a full batch on a connected Instagram account with configured email and durable public media hosting.
- [ ] Confirm deployed video storage is durable and background workers are always-on. The current renderer writes to local disk, which is not durable across redeploys on the documented free hosting setup.

### Batch 18 - Workspace light-theme alignment

- [x] Add a shared light-mode surface layer for dashboard panels/cards, content plans, approvals, analytics, media, templates, designs, social accounts, system status, and Video Studio, using consistent white cards, soft borders, readable text, and pale control surfaces.
- [x] Normalize form-control and placeholder contrast in light mode while preserving status colors and saved theme accent gradients for primary actions and active navigation.
- [x] Web lint and typecheck pass; theme palette guard and optimized production build pass.
- [x] Restart the local production web server and confirm the dashboard responds over HTTP with the updated light-theme CSS bundle available.
- [ ] Visual review in the authenticated browser across all dedicated pages and each saved color preset remains pending.

### Batch 19 - Light-mode screenshot corrections

- [x] Enlarge and restyle the Video Studio provider badge so its label fits a proper theme-tinted pill.
- [x] Make sidebar tool search, dropdowns, theme configuration panels, and Create format/platform tiles use legible white-mode surfaces and text.
- [x] Restore the blue-to-violet active/hover navigation treatment in both light and dark modes; keep preset colors sourced from theme tokens.
- [x] Add subtle theme-colored gradients and accents to light dashboard metrics/panels so the white theme retains visual depth.
- [x] Web lint, typecheck, theme palette guard, production build passed; restarted local web server and confirmed Dashboard, Create, and Video Studio return HTTP 200.
- [ ] Visual confirmation across all settings pages/presets remains pending in the user's authenticated browser.

### Batch 20 - Preserve selected theme palettes during navigation

- [x] Fix the legacy green-palette migration that was replacing deliberately selected Teal and Gold, Forest Green, and custom green palettes with Midnight Blue and Purple on route changes.
- [x] Keep normalization/validation while no longer rewriting valid saved palette choices in the global theme provider or workspace-shell settings load.
- [x] Web lint, typecheck, theme palette guard, and optimized production build pass; restarted local web server and confirmed Appearance and Dashboard routes return HTTP 200.
- [ ] Verify palette persistence after changing settings in the authenticated browser; the code path now retains the chosen preset across workspace-shell and global-provider hydration.

### Batch 21 - Appearance editor dark-mode legibility

- [x] Correct dark-mode appearance palette tiles and scope buttons so they use dark theme surfaces instead of white cards.
- [x] Fix dark-mode Live preview heading/body contrast and bring its selected theme accent into the active palette.
- [x] Prevent workspace-layout controls from overflowing by allowing fields to shrink and reducing columns at narrower desktop widths.
- [x] Web lint, typecheck, theme palette check, and production build pass; restarted local server and confirmed Appearance returns HTTP 200.
- [ ] Review the Appearance page in the signed-in browser at desktop and narrow viewport widths.

### Batch 22 - Unified theme palette and explicit application

- [x] Keep the Blue and Purple palette as the default and reduce the appearance picker to eight coordinated presets.
- [x] Arrange the palette as four cards per row on desktop and enlarge the paired rectangular swatches.
- [x] Use the selected palette's primary/accent gradient consistently for primary actions and active/hover navigation across presets.
- [x] Restore workspace-wide Modern (Inter), Editorial (Playfair headings), and Classic (Arial/Georgia) font choices; removed legacy CSS that forced Inter over saved font selection.
- [x] Make palette/font/layout edits live previews and require the explicit Apply appearance action to save account/workspace settings.
- [x] Update the prebuild palette guard for the eight-preset design; lint, typecheck, palette guard, and optimized web production build pass.
- [x] Restart local web server and confirm Appearance route returns HTTP 200.
- [ ] Review palette interactions and font rendering visually in the authenticated browser.

### Batch 23 - Swatch-only picker, light calendar arrows, and shared CTA gradient

- [x] Render eight theme choices as four-per-row swatches without enclosing tile cards; each palette shows two larger side-by-side colors, with a discreet selected outline.
- [x] Use the sign-in blue-purple style gradient consistently for all shared `.button` actions and keep theme-driven gradients for navigation and hover states.
- [x] Fix dashboard week and publishing calendar previous/next controls for readable light-mode backgrounds and icons.
- [x] Add subtle theme-colored accents to light dashboard KPI cards and AI panel while preserving real-only analytics values.
- [x] Web lint/typecheck, eight-palette guard, and production build pass; restarted local web server.
- [x] Confirm the running Appearance route serves the new client bundle and the old auto-save copy is absent; HTTP 200.
- [ ] Browser tab needs a hard refresh to discard the earlier cached Appearance bundle; authenticated visual review remains pending.

### Batch 24 - Preserve selected fonts in workspace page titles

- [x] Remove later shared page-title overrides that forced Inter and prevented the saved Editorial and Classic heading choices from applying to dedicated workspace pages.
- [ ] Verify page-title typography in the authenticated browser with all three font choices; source-only CSS change, no automated checks run.

### Batch 25 - Appearance palette clarity and settings navigation

- [x] Keep palette choices unboxed and show each color name and hex value alongside its swatch; keep an explicit Save action after preview selection.
- [x] Clarify workspace style option labels without removing existing appearance controls or saved settings.
- [x] Move settings section links into a horizontal in-page navigation while preserving their dedicated routes and active-page state.
- [x] Use white text for primary action buttons in dark mode.
- [ ] Review the Appearance and Settings pages in the authenticated browser in light and dark modes; automated checks not run.

### Batch 26 - Analytics dashboard layout, appearance simplification, and stable sidebar state

- [x] Reshape Analytics to match the supplied dashboard reference using confirmed publishing activity, actual upcoming scheduled slots, and live target status; no inbox or engagement metrics are invented.
- [x] Remove contrast warnings, preview panel, workspace style controls, and workspace-default section from Appearance while retaining palette preview/save and the personal reset action.
- [x] Keep the active navigation destination visible on route changes, strengthen its selected state, and restore a narrow low-contrast sidebar scrollbar.
- [ ] Review Analytics and sidebar navigation in the authenticated browser at desktop and narrow widths; full visual review remains pending.

### Batch 27 - Brand Kit form alignment

- [x] Align the Brand Kit profile fields into a consistent two-column grid, use the full row for banned-word guidance, and stack logo, palette, and font controls cleanly at narrow widths.
- [x] Place the visual identity logo preview and related palette/font controls in balanced columns; show a readable fallback if the saved logo preview cannot load.
- [ ] Review the long Brand Kit page in the authenticated browser at desktop and mobile widths.

### Batch 28 - Preserve saved color palettes on settings reads

- [x] Remove the API read-time migration that rewrote saved teal, forest, and custom green themes to the default blue-violet preset; settings reads now return saved user/workspace values unchanged.
- [x] Keep the narrow sidebar scrollbar override after the prior hide rules, with a 5px thumb and theme-aware color.
- [ ] Confirm palette persistence through an authenticated save-and-navigate browser session; local server refresh pending.

### Autopilot mix, email review, Magic Hour media, and Gallery reliability

- [x] Add per-run Autopilot controls for a 1–30 day schedule, format counts, and an optional campaign focus; interleave formats across the schedule and reuse the last chosen settings for recurring weekly runs.
- [x] Generate product demonstration and presenter-avatar videos through the Magic Hour API using eligible images from Gallery or Media Library; apply the Brand Kit logo as an upper-left watermark after rendering and persist an idempotency key so worker retries reuse the existing Magic Hour job.
- [x] Include LinkedIn banner and Facebook cover assets in approval review. Approvals for the only live integration (Instagram) create scheduled publish jobs; unsupported destinations are marked as downloadable drafts and never sent to the Instagram publisher.
- [x] Keep individual approve/request-changes actions and carousel page previews in the secure email review page; report queued Instagram items separately from draft-only items.
- [x] Let Video Studio select eligible imported images from Gallery or Media Library and keep its visible generation workflow on Magic Hour.
- [x] Diagnose the Gallery/Import files error as MariaDB's `max_allowed_packet=1MB` rejecting full image BLOBs and dropping the connection (`P1001`); write uploads in 512KB chunks and return a clear database-unavailable response if MySQL is genuinely unreachable.
- [x] API and web typechecks and ESLint pass; local API database readiness and Autopilot page HTTP response are healthy.
- [ ] Validate a real user-upload retry, email review decision, Magic Hour generation, and scheduled Instagram publication in the signed-in browser. These require the user's account session and configured external services; LinkedIn/Facebook live publishing also needs those integrations and credentials.
- [ ] Existing generated images and videos are not retroactively watermarked; logo placement applies to newly generated visual assets.
