# Feature Inventory and Preservation Checklist

## Scope and verification

This inventory records the existing public pages, workspace destinations, visible tool workflows, and mounted API surface before the app-wide icon pass. The redesign changes icon presentation and shared styling only: it does not remove or rewire a page, form submission, filter, permission check, API integration, database operation, or workflow.

Status definitions: **Preserved** means the existing route or behavior remains; **Enhanced** means its visual presentation was updated without changing its behavior; **Newly Added** means this change introduces a capability.

## Public and account routes

| Existing route or feature | Existing capability retained | Status |
|---|---|---|
| `/` | Public landing page and navigation into the product | Preserved |
| `/features`, `/how-it-works`, `/about` | Product information, feature links, and explanatory content | Enhanced |
| `/pricing`, `/contact` | Plan information and existing signup/sign-in/support guidance | Enhanced |
| `/signup`, `/login` | Account creation and sign-in forms | Preserved |
| `/accept-invite` | Team-invitation acceptance workflow | Preserved |

## Workspace pages and controls

| Existing page or module | Existing capability retained | Status |
|---|---|---|
| Dashboard | Workspace selection, brand-profile gate, real publishing counts, weekly scheduled-post calendar, account connection status, AI recommendation, and links to existing tools | Enhanced |
| Create | Brief entry, format selection, generation configuration, platform variations, template/design selection, preview, edits, save, and existing generation actions | Enhanced |
| Campaigns | Campaign brief, audience and platform choices, generated campaign content, and saved plan workflow | Preserved |
| Content Plans | Plan search/list, create, activate/archive/update, and plan-to-post links | Preserved |
| Content Sets | Saved multi-format sets, linked drafts, platform summaries, and create/review links | Preserved |
| Content library | Search, format/platform/status/brand filters, edit, duplicate, delete, version history/restore, and platform regeneration | Preserved |
| Designs | Saved design browsing, detail/preview, edit, duplicate, delete, and version restore | Preserved |
| Templates | Template browsing, search, format filters, and starting a creation workflow | Preserved |
| Gallery | Gallery filters, import, saved-asset listing, and moving assets between Gallery and Media Library | Preserved |
| Media Library / Import files | Upload, browse, search/filter, preview, download, delete, and use of imported/generated media | Preserved |
| Video Studio | Idea-to-video planning, script and scene edits, local rendering, job progress, playback, download, cancel, delete, and regeneration | Preserved |
| Calendar | Calendar navigation, date filtering, scheduled-post views, and create-for-date action | Preserved |
| Posts and Queue | Draft creation, post quality checks, scheduling, live/demo status, retry, cancel, delete, and Instagram sync | Preserved |
| Approvals | Existing approval list and post review actions exposed by Posts and Queue; no reviewer workflow is implied where none is configured | Preserved |
| Social Accounts | Instagram configuration/readiness, OAuth connect/callback, connected-account listing, and disconnect | Preserved |
| Marketing Brain | Business-context summary, evidence-based recommendations, and recommendation decisions | Preserved |
| Analytics | Period filters, real publishing-status counts, activity chart, recent results, and explicit unavailable-data messaging (no simulated metrics) | Enhanced |
| Inbox / Listening | Existing guided screens and connection-availability messaging; no live integration is claimed where none is configured | Preserved |
| Brand Profile and Brand Kit | Business/profile form, brand details, kit settings, upload-related workflow, and profile-completion gate | Preserved |
| Team | Member list, invitation, invitation cancellation, role changes, owner transfer, and member removal with existing permissions | Preserved |
| Settings | Account/security actions, appearance presets/custom colors, light/dark/system modes, layout settings, and publishing time zone | Preserved |
| Billing and Plan | Existing trial and public-plan guidance; no payment provider or subscription-management capability is claimed | Preserved |
| System Status | Existing owner/admin-only service and publishing readiness checks | Preserved |
| Admin Customers, Plans, Requests, Resellers | Existing permission-gated navigation and the pages' current setup/readiness guidance | Preserved |

## API and integration surface

All existing API routes remain mounted. This icon/UI pass adds no API, database, migration, permission, or integration changes.

| Existing API area | Existing endpoints and behavior | Status |
|---|---|---|
| Health and workspace | `GET /health`, `GET /health/ready`, `GET /api/workspaces`, `GET /api/dashboard` | Preserved |
| Authentication | `POST /api/auth/signup`, `/login`, `/refresh`, `/logout`, `/change-password`, `/accept-invite`; `GET /api/auth/me`; `DELETE /api/auth/account` | Preserved |
| Brand profile | `GET /api/brand-profile`, `PUT /api/brand-profile` | Preserved |
| Content | `GET /api/content/configuration`, `POST /api/content/generate`, `GET /api/content`, `GET /api/content/:id`, `GET /api/content/:id/versions`, `POST /api/content/:id/versions/:version/restore`, `PATCH /api/content/:id`, `POST /api/content/:id/regenerate-platform`, `POST /api/content/:id/duplicate`, `DELETE /api/content/:id` | Preserved |
| Templates and designs | `GET /api/templates`; `GET /api/designs`, `GET /api/designs/:id/versions`, `PATCH /api/designs/:id`, `POST /api/designs/:id/versions/:version/restore`, `POST /api/designs/:id/duplicate`, `DELETE /api/designs/:id` | Preserved |
| Plans and sets | `GET`, `POST /api/content-plans`, `PATCH /api/content-plans/:id`; `GET`, `POST /api/content-sets` | Preserved |
| Posts and approvals | `POST /api/posts/quality-check`, `GET /api/posts/approvals`, `POST /api/posts/:id/submit-for-approval`, `POST /api/posts/approvals/:id/review`, `POST /api/posts/sync-instagram`, `GET`, `POST /api/posts`, `POST /api/posts/drafts`, `POST /api/posts/:id/retry`, `POST /api/posts/:id/cancel`, `DELETE /api/posts/:id` | Preserved |
| Social accounts | `GET /api/social-accounts/instagram-media/:targetId`, `GET /api/social-accounts/instagram/callback`, `GET /api/social-accounts`, `POST /api/social-accounts/instagram/connect`, `DELETE /api/social-accounts/:id` | Preserved |
| Media and Gallery | `GET`, `POST /api/media/uploads`, `GET /api/media/uploads/:id/file`, `DELETE /api/media/uploads/:id`, `PATCH /api/gallery/:kind/:id` | Preserved |
| Video jobs | `GET /api/videos/configuration`, `/publishing-readiness`, `/music/:trackId`, `/jobs`, `/jobs/:id/events`, `/jobs/:id/file`, `/jobs/:id/thumbnail`; `POST /api/videos/idea-to-mp4/plan`, `/render`, `/jobs/:id/cancel`, `/jobs/:id/regenerate`; `PATCH /api/videos/jobs/:id`; `DELETE /api/videos/jobs/:id` | Preserved |
| Marketing Brain | `GET /api/marketing-brain`, `POST /api/marketing-brain/:id/decision` | Preserved |
| Team | `GET /api/team`, `POST /api/team/invites`, `DELETE /api/team/invites/:id`, `PATCH /api/team/members/:id/owner`, `PATCH /api/team/members/:id`, `DELETE /api/team/members/:id` | Preserved |
| Theme settings | `GET`, `PUT /api/theme-settings`, `DELETE /api/theme-settings/user` | Preserved |
| System status | `GET /api/system/status` (owner/admin restricted) | Preserved |

## Icon-system implementation checklist

- [x] Confirmed `lucide-react` is the only imported general-purpose icon library; no other icon-library imports were found.
- [x] Kept brand-specific social-platform marks so platform identity remains clear.
- [x] Standardized Lucide stroke weight, alignment, sizing, and hover treatment with shared app-wide styles.
- [x] Added consistent icon containers and active/hover treatments to workspace navigation and dashboard cards.
- [x] Replaced text-symbol icons in dashboard analytics, empty states, public feature cards, account entry points, and the creation shortcut with meaningful Lucide icons.
- [x] Preserved the actions associated with these icons and kept their labels, routes, and handlers unchanged.
- [x] Retained all existing appearance choices and kept the midnight blue/violet palette as the default.
- [ ] Complete the wider AI-autopilot roadmap separately; no new autonomous publishing behavior is enabled by this visual pass.

## Dashboard reference redesign

- [x] Reworked the workspace shell and dashboard toward the supplied dark navy, blue, and violet reference while retaining the existing navigation and account controls.
- [x] Kept the weekly calendar, publishing counts, AI recommendation, social-account status, quick links, and pipeline available.
- [x] Added an approval-queue preview that links to the existing review workflow.
- [x] Added a compact weekly publishing chart using only live posts confirmed by connected platforms; demo activity is excluded.
- [x] Kept unavailable engagement and time-saved metrics out of the dashboard rather than displaying invented values.

## Verification checklist

- [x] Navigation destinations remain represented by the existing navigation configuration and dedicated/dynamic page routes.
- [x] API route modules and operations remain unchanged in this icon pass.
- [x] No database schema or existing records are changed by this icon pass.
- [x] Run web/API type checking, web linting, route-preservation and API tests, theme palette validation, and a production web build after the dashboard updates.
