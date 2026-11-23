# United Technologies

United Technologies is a multi-tenant social content workspace. The working implementation includes the monorepo foundation, shared brand and plan configuration, cookie-based signup/login, workspace trials, tenant-scoped dashboard data, brand-profile onboarding, a responsive logged-in shell, and database-backed content review and design workflows. The public website includes dedicated Features, How it works, Pricing, About, and Contact pages with shared navigation.

The logged-in app includes Overview, Create, Content Plans, Content Sets, Content, Designs, Videos, Media Library, Gallery, Import files, Templates, Calendar, Posts and Queue, Social Accounts, Approvals, Inbox, Analytics, Listening, Brand Profile and Brand Kit, Team, Billing and Plan, and Settings. Workspace owners and admins also see System Status; configured super-admin accounts see administrative pages. New and returning users must complete the required brand foundation before workspace tools and creation APIs become available. The dashboard surfaces live publishing counts, a week-by-week post calendar, account connection status, and brand-aware recommendations; it does not invent performance metrics. Gallery is a separate collection: assets can be moved from Media Library to Gallery and moved back without duplication. The top bar includes a Gallery shortcut, active-page label, tool search, and account menu. Settings includes appearance preferences, account details, password changes, and self-service account deletion. Account deletion verifies the current password and explicit confirmation, preserves workspace data, and requires transferring workspace ownership first; reseller owners must contact support. Appearance settings include light/dark/system modes, multiple color palettes, custom colors, and workspace-default or user-specific preferences. Each sidebar route has its own screen or tailored workflow guidance, with unconfigured integrations identified rather than presented as working. The starter library provides 60 named template variants for each of 14 formats, with original compositions, palette variations, format shelves, and search/filter browsing. Instagram Autopilot includes a one-time test action in the Library and an optional recurring mode in the brand profile. It can generate 13 posts per batch (11 static-format creatives and two rendered Reels), schedule three posts each Monday through Wednesday and two each Thursday and Friday using the brand time zone, and send one approval batch to the workspace owner grouped by day. It does not publish until the batch is approved. During the 14-day trial, app-level monthly AI generation quotas do not apply; the trial still expires at its configured end, and AI provider, platform, setup, and security limits still apply. Autopilot also requires an Instagram Professional account, email delivery configuration, and public HTTPS media hosting. Rendered video is still stored on the API's local filesystem, so persistent storage is required for reliable production use. See [PROGRESS.md](./PROGRESS.md) for verified features and remaining work.

Campaigns is a dedicated workspace tool. It generates multi-format, multi-platform drafts with Gemini and saves the goal, date range, channels, and suggested post dates in Content Plans. Gemini rate limits and overloads are retried up to three times with backoff; if Gemini still fails, a configured Groq key is used automatically. Both providers validate output before saving; generation errors never save fallback copy. Plans can be activated or archived, but their suggested dates do not create scheduled posts. Create includes per-platform feed previews for review; these are illustrative previews rather than pixel-accurate platform replicas. See [PROGRESS.md](./PROGRESS.md) for the batch-level limitations and remaining work.

## Multi-provider text generation

Social drafts, campaigns, platform-specific caption regeneration, and Idea to MP4 scripts try Google's native `@google/genai` SDK first, then optional Groq, then optional OpenAI. Configure `GOOGLE_AI_STUDIO_API_KEY` in `apps/api/.env`; no key-format validation is applied. Add `GROQ_API_KEY` and/or `OPENAI_API_KEY` to enable further fallbacks. OpenAI API usage may incur charges and is not guaranteed to have a free tier. Provider keys stay server-side and are never returned to the browser or logged. Transient 429/503 errors are retried with bounded backoff; invalid JSON/schema output is retried before switching providers. If every configured provider fails, generation returns an actionable error and saves no draft. Active trial workspaces have no app-level monthly AI generation quota during the 14-day trial; this does not remove provider limits or extend the trial. Every generated draft remains editable and requires an explicit user action before scheduling or publishing.

## Campaign intelligence and integration limits

Campaigns can generate and persist a goal-led strategy, three scored creative concepts, audience hypotheses, positioning and CTAs, channel/funnel recommendations, a day-by-day content sequence, execution tasks assigned to workspace members, optional paid-media advice, experiments, and readiness checks. The strategy is saved as a workspace-scoped Content Plan before content production; daily drafts and dates are attached as they are generated, so partial work can be reopened and continued. Campaigns can be reviewed, edited, approved, duplicated, and exported. Approval does not publish: approved drafts must still pass through the existing Content Plans/approvals workflow.

The campaign strategist uses the submitted brief, saved brand profile, existing generated content/media inventory, active Marketing Brain recommendations, and prior campaign plans. There is no external trend, keyword-volume, or competitor research connector. Generated audience insights, concept scores, paid-media advice, and timing guidance are recommendations or hypotheses, not verified market research. Instagram is the only live social publisher in this project; other selected channels receive drafts only. Campaign-attributed reach, engagement, leads, conversions, and return are not inferred from unrelated analytics and remain unavailable until a source can reliably associate those measurements with a campaign.

Historical content already stored in a workspace is not deleted by this update. Imported media records and visual layout templates are not generated copy; starter templates supply composition metadata only. The existing deterministic Marketing Brain rules and local seasonal calendar provide planning metadata, not generated captions or scripts. Non-Instagram publishing simulations remain clearly labeled as simulations.

## Free test deployment

The [Render Blueprint](./render.yaml) creates a free web service for the Next.js app and a Docker-based free API service with FFmpeg and Piper voice support. The web service receives the API hostname automatically. The API derives its public URL from Render's `RENDER_EXTERNAL_URL`; set `WEB_ORIGIN` to the exact public hostname of the web service when creating the Blueprint.

Before deploying, create a MySQL-compatible hosted database (for example, a free TiDB Cloud Serverless cluster if available to your account) and have its TLS-enabled connection URL ready. Render's free managed database is PostgreSQL and is not compatible with this app's MySQL Prisma schema. In Render, create a Blueprint from the GitHub repository and select `render.yaml`; enter the database URL, the web service's public hostname, and a 64-character hexadecimal `SOCIAL_TOKEN_ENCRYPTION_KEY` when prompted. Keep the generated JWT secrets in Render and do not copy credentials into this repository.

After both services deploy, configure the Meta app with the API's exact callback URL, `https://YOUR_API_HOST/api/social-accounts/instagram/callback`, then add the Instagram app ID, app secret, and that same redirect URL to the API service's environment in Render. For video publishing, enable the social-token encryption key and verify the API readiness check from the app. Add `GOOGLE_AI_STUDIO_API_KEY` for text generation and a Pexels key only if the optional stock-visual workflow is needed.

To run Instagram Autopilot, configure Gmail with `GMAIL_USER` and `GMAIL_APP_PASSWORD`, or use Resend with `RESEND_API_KEY` and `EMAIL_FROM`, in `apps/api/.env`, then restart the API. For Gmail, enable 2-Step Verification on the sender account and create an app password; do not use the normal Gmail password. In Settings → Publishing, set the recipient Gmail address. Complete the brand profile, connect an eligible Instagram Professional account, and keep `PUBLIC_API_URL` reachable over HTTPS. In the Library, open Instagram Autopilot and select **Generate 13 posts now** for a one-time test batch; it uses the saved brand profile and does not ask for a prompt. The approval email groups the posts by scheduled day. To continue generating batches weekly, enable recurring Autopilot in the brand profile. Nothing publishes before email approval. Its two Reels per batch are rendered locally, so the documented free hosting plan is not durable enough for dependable production video storage.

Imports support files up to 500 MB. Files up to 100 MB continue to use the database; larger files upload directly from the browser to private S3-compatible object storage and are streamed through the authenticated API when viewed. Configure `S3_BUCKET` and `S3_REGION`; for S3-compatible providers such as Cloudflare R2, also set `S3_ENDPOINT`, access-key credentials, and `S3_FORCE_PATH_STYLE` as required by that provider. Configure the bucket CORS policy to allow `PUT` from the web app origin and the signed `Content-Type`, `x-amz-meta-workspaceid`, and `x-amz-meta-ownerid` headers. For Cloudflare R2, use the account endpoint, region `auto`, and path-style addressing. Do not put credentials in the repository. Without storage configuration, uploads over 100 MB return an explicit setup error.

The web app forwards browser `/api/*` requests through a same-origin runtime proxy, including authentication cookies and streamed media. This is important on Render because the web and API `onrender.com` subdomains are separate browser sites; direct cross-site API cookies can be blocked and cause a successful sign-in to bounce back to the sign-in page. Keep `NEXT_PUBLIC_API_BASE_URL` set to the API origin in the web service and `WEB_ORIGIN` set to the exact web origin in the API service. While a signed-in dashboard is open, it checks connected Instagram media every five minutes and marks locally published Instagram targets that no longer appear in the account's media list; it preserves local history and other platform targets. Newly published posts are allowed ten minutes to appear in Instagram's media list before a deletion check applies. Instagram does not provide this integration with a media-deletion webhook, so this check does not run while the app is closed and may be delayed if Instagram is unavailable. This is a test deployment, not a production hosting setup. Free Render services can sleep, have limited CPU and memory, and do not provide durable local disk. The API currently stores rendered video files on its local filesystem, so videos can disappear when the service restarts or redeploys; long renders and scheduled publishing may be delayed or interrupted while a free service sleeps. Durable video storage and reliable always-on background processing require additional hosting/storage configuration. Real Instagram publishing also depends on Meta app roles, permissions, account eligibility, and access review; a successful deploy alone does not guarantee posts or analytics access.

If the API deploy reports Prisma `P3009` for `20261102100000_mysql_media_uploads`, stop retrying deploys until the production schema has been checked. The migration adds the `PostTarget.mediaAssetId` column, its index, and its foreign key in separate statements because the database rejected creating the index in the same `ALTER TABLE` as the column. Back up the database, then inspect the state with:

```sql
SELECT TABLE_NAME, COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'MediaAsset' AND COLUMN_NAME = 'fileData')
    OR (TABLE_NAME = 'PostTarget' AND COLUMN_NAME = 'mediaAssetId'));

SELECT INDEX_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'PostTarget'
  AND INDEX_NAME = 'PostTarget_mediaAssetId_idx';

SELECT CONSTRAINT_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'PostTarget'
  AND CONSTRAINT_NAME = 'PostTarget_mediaAssetId_fkey'
  AND REFERENCED_TABLE_NAME = 'MediaAsset';
```

Apply only the missing statements, individually:

```sql
ALTER TABLE `MediaAsset` ADD COLUMN `fileData` LONGBLOB NULL;
ALTER TABLE `PostTarget` ADD COLUMN `mediaAssetId` VARCHAR(191) NULL;
ALTER TABLE `PostTarget` ADD INDEX `PostTarget_mediaAssetId_idx` (`mediaAssetId`);
ALTER TABLE `PostTarget`
  ADD CONSTRAINT `PostTarget_mediaAssetId_fkey`
  FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

Once all four schema elements match `apps/api/prisma/migrations/20261102100000_mysql_media_uploads/migration.sql`, mark the failed migration applied with `npx prisma migrate resolve --applied 20261102100000_mysql_media_uploads --schema apps/api/prisma/schema.prisma` using the API workspace and the same production `DATABASE_URL`. Then redeploy the API so remaining migrations can run. Never mark the migration applied before verifying every schema element, and never drop tables or blindly rerun the migration.

## Design document foundation

The shared `DesignDocument` version 1 type stores a palette and ordered pages with physical pixel dimensions, backgrounds, and typed layers. The current SVG renderer validates input, encodes user text safely, and handles the core generated layout, text, shapes, images, frames, groups, tables, and chart primitives. Carousel pages share one document and can be paged through and exported individually or together as a multi-page PDF. Flyer copy is arranged in three columns, while brochure copy fills six panels across both sides. Legacy saved design records are converted in API responses and kept intact in MySQL. The full editor, locally bundled font kit, advanced image/text effects, QR generation, and complete print/export parity are not implemented yet; see the Batch A status in [PROGRESS.md](./PROGRESS.md).

## Windows development setup

Requirements: Node.js 20 or newer, npm, and MySQL 8 or a compatible XAMPP MariaDB service running locally.

1. Create a database in MySQL:

   ```sql
   CREATE DATABASE united_technologies CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. From PowerShell in the repository root, install packages and configure the API:

   ```powershell
   npm install
   Copy-Item apps\api\.env.example apps\api\.env
   Copy-Item apps\web\.env.example apps\web\.env.local
   ```

3. Edit `apps\api\.env` and set `DATABASE_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET`. Use different random secrets of at least 32 characters. Keep `COOKIE_SECURE=false` for local HTTP.

   To enable real Magic Hour generation in Video Studio, set `MAGIC_HOUR_API_KEY` in `apps\api\.env` to your Magic Hour key, then restart the API. The key is read only by the backend and must never be added to the web app environment or committed. Magic Hour calls can use account credits. Product image, text-to-video, Talking Photo, and Lip Sync jobs are asynchronous and their finished files are copied into the app's Gallery.

4. To test real Instagram publishing, deploy the API at a publicly reachable HTTPS address and configure a Meta Business app with Instagram Login. Add this exact redirect URI in Meta's Instagram business login settings:

   ```text
   https://YOUR_API_HOST/api/social-accounts/instagram/callback
   ```

   In `apps\api\.env`, set `PUBLIC_API_URL` to that HTTPS API origin, `INSTAGRAM_REDIRECT_URI` to the callback above, `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` from Meta, and `SOCIAL_TOKEN_ENCRYPTION_KEY` to a new random 32-byte key encoded as 64 hexadecimal characters. For example, generate the encryption key in PowerShell with:

   If your web app is hosted on a stable custom domain and proxies `/api/*` to the API, you can use the web domain as the public API origin instead. Set `PUBLIC_API_URL` to the web origin and `INSTAGRAM_REDIRECT_URI` to `https://YOUR_WEB_DOMAIN/api/social-accounts/instagram/callback`. The web deployment must proxy both `/api/*` and `/health` to the API; this project provides the `/health` proxy route for that setup.

   ```powershell
   $bytes = New-Object byte[] 32
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $rng.GetBytes($bytes)
   [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
   ```

   Add Instagram Login to the Meta app and request `instagram_business_basic` and `instagram_business_content_publish`. Use an Instagram Professional (Business or Creator) account and grant your Meta app user/tester access while the app is in Development mode. Use Meta's App Review and Advanced Access for accounts outside the app's roles. Never commit or share the app secret or encryption key.

5. To connect Facebook Pages, configure the same Meta app with Facebook Login and register this exact callback URL:

   ```text
   https://YOUR_API_HOST/api/social-accounts/facebook/callback
   ```

   Set `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and `FACEBOOK_REDIRECT_URI` in `apps\api\.env`; use the Facebook callback above for `FACEBOOK_REDIRECT_URI`. Keep the same `SOCIAL_TOKEN_ENCRYPTION_KEY` used by Instagram, and use `FACEBOOK_GRAPH_API_VERSION` only when intentionally selecting a different supported Graph API version. The connection requests `pages_show_list`, `instagram_basic`, `instagram_manage_insights`, and `pages_read_engagement`, and stores user and Page access tokens encrypted. Instagram competitor Business Discovery requires an eligible linked professional account and Meta app approval/permissions; reconnect Facebook after configuring them.

   **Competitor analytics setup:** Competitor Intelligence automatically searches for up to six competitors when the page is opened and an industry, product, or business description is saved in Brand Profile. Configure `TAVILY_API_KEY` for discovery, `YOUTUBE_DATA_API_KEY` for public YouTube channel/video statistics, and `X_API_BEARER_TOKEN` for public X posts. Instagram competitor posts use Facebook Login Business Discovery as described above. Facebook, LinkedIn, TikTok, and Pinterest profile links are saved, but this app does not have approved competitor-data API connectors for them. API coverage and visible counts vary by account and platform.

   For local API development, `PUBLIC_API_URL` must be an active public HTTPS tunnel that forwards to the local API. Temporary tunnel URLs expire; update this setting and restart the API whenever the tunnel URL changes. Instagram cannot fetch media from `localhost`.

5. Apply the schema, generate Prisma Client, and seed the administrator and starter templates. For a database that already contains applied migrations, do not reset it to resolve migration history or checksum errors; inspect the schema first and apply only reviewed additive migrations. The two current marketing migrations add a Content Sets table and optional profile voice-rule fields.

   ```powershell
   npm run prisma:generate --workspace=@united-technologies/api
   npm run prisma:migrate --workspace=@united-technologies/api
   npm run prisma:seed --workspace=@united-technologies/api
   ```

6. Install FFmpeg and configure offline Piper narration for Video Studio:

   ```powershell
   winget install Gyan.FFmpeg
   winget install Python.Python.3.12
   py -3.12 -m pip install piper-tts
   New-Item -ItemType Directory -Force apps\api\assets\voices
   Push-Location apps\api\assets\voices
   py -3.12 -m piper.download_voices en_US-libritts_r-medium
   Pop-Location
   ```

   Restart PowerShell and the API after installing FFmpeg so `ffmpeg` and `ffprobe` are on `PATH`. Set `PIPER_EXECUTABLE` to the installed `piper.exe` path. `PIPER_MULTISPEAKER_VOICE_MODEL` may point to the downloaded `.onnx` file; when unset, the API uses `apps\api\assets\voices\en_US-libritts_r-medium.onnx` if present. Keep the matching `.onnx.json` beside the model. Video narration uses free, local Piper inference only; there are no paid text-to-speech API integrations. The bundled LibriTTS-R medium model exposes five different US English speakers. The LibriTTS-R dataset is licensed CC BY 4.0 (see [its Piper model card](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/libritts_r/medium) and [CC BY 4.0 terms](https://creativecommons.org/licenses/by/4.0/)); retain attribution and review the license before commercial distribution.

   Add a Pexels API key to enable stock photos and clips in the existing guided video flow; the Idea to MP4 workflow always uses locally drawn scenes and never inserts stock footage. Remotion renders H.264 MP4 files through the system FFmpeg binaries. Each render bundles to its own local per-job directory, which the renderer uses directly rather than the web application's origin; the first render may automatically download Remotion's Chrome Headless Shell. The music manifest is `apps\api\assets\music\manifest.json`; add only royalty-free tracks you are licensed to use and record the title, mood, duration, and license note for every file. The included background tracks are original synthesized compositions, each with a distinct arrangement.

7. In two PowerShell windows at the repository root, start the services:

   ```powershell
   npm run dev --workspace=@united-technologies/api
   ```

   ```powershell
   npm run dev --workspace=@united-technologies/web
   ```

   Open `http://localhost:3000`. The API listens at `http://localhost:4000`.

## Environment variables

| App | Variable | Purpose |
|---|---|---|
| API | `NODE_ENV` | Runtime mode (`development`, `test`, or `production`) |
| API | `API_PORT` | HTTP port (default 4000) |
| API | `WEB_ORIGIN` | Exact frontend origin allowed by CORS |
| API | `PUBLIC_API_URL` | Public HTTPS API origin Instagram can fetch post images from; defaults to Render's `RENDER_EXTERNAL_URL` when present |
| API | `FFMPEG_PATH` / `FFPROBE_PATH` | Optional full executable paths when FFmpeg is not on `PATH` |
| API | `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Instagram Login credentials from the Meta Business app |
| API | `INSTAGRAM_REDIRECT_URI` | Exact callback URL registered in Meta |
| API | `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Facebook Login credentials from the Meta app |
| API | `FACEBOOK_REDIRECT_URI` | Exact Facebook callback URL registered in Meta |
| API | `FACEBOOK_GRAPH_API_VERSION` | Facebook Graph API version (default `v26.0`) |
| API | `TAVILY_API_KEY` | Search provider key for automatic competitor website discovery |
| API | `YOUTUBE_DATA_API_KEY` | YouTube Data API key for public channel/video statistics |
| API | `X_API_BEARER_TOKEN` | X API bearer token for recent public account posts and metrics |
| API | `SOCIAL_TOKEN_ENCRYPTION_KEY` | 32-byte hex key used to encrypt connected social tokens at rest |
| API | `INSTAGRAM_GRAPH_API_VERSION` | Instagram Graph API version (default `v26.0`) |
| API | `PRODUCT_NAME` | API log and seeded-admin product label |
| API | `SUPER_ADMIN_EMAIL` | Email allowed to see the super-admin navigation |
| API | `DATABASE_URL` | MySQL connection string |
| API | `JWT_ACCESS_SECRET` | Access-cookie JWT signing secret, at least 32 characters |
| API | `JWT_REFRESH_SECRET` | Refresh-token signing secret, at least 32 characters |
| API | `COOKIE_SECURE` | Set `true` behind HTTPS; use `false` for local HTTP |
| API | `GOOGLE_AI_STUDIO_API_KEY` | Primary key for generated content and video scripts; kept on the API server |
| API | `GOOGLE_AI_STUDIO_MODEL` | Gemini model (default `gemini-3.5-flash-lite`) |
| API | `GROQ_API_KEY` | Optional server-side fallback for text generation when Gemini fails |
| API | `GROQ_MODEL` | Groq fallback model (default `llama-3.3-70b-versatile`) |
| API | `OPENAI_API_KEY` | Optional final fallback for text and video-script generation; API usage may be billable |
| API | `OPENAI_MODEL` | OpenAI fallback model (default `gpt-4o-mini`) |
| API | `PIPER_EXECUTABLE` | Piper command or executable path (default `piper`) |
| API | `PIPER_VOICE_MODEL` | Local Piper `.onnx` model path for offline narration |
| API | `PIPER_MULTISPEAKER_VOICE_MODEL` | Optional path to the Piper multi-speaker `.onnx` model |
| API | `RHUBARB_EXECUTABLE` | Optional Rhubarb Lip Sync command or full path (default `rhubarb`; checked on System Status) |
| API | `PEXELS_API_KEY` | Optional Pexels API key for stock photos and video clips in the guided video flow; Idea to MP4 uses local illustrations |
| API | `SEED_ADMIN_EMAIL` | Email for the local seeded workspace administrator |
| API | `SEED_ADMIN_PASSWORD` | Local seed password (12–72 UTF-8 bytes) |
| Web | `NEXT_PUBLIC_API_BASE_URL` | API origin used by browser requests |

`supportEmail` and `websiteUrl` in the shared brand configuration are placeholders (`example.com`) and must be replaced with United Technologies' real contact details before launch. The supplied United Technologies logo mark is installed in `apps/web/public/brand/logo.png` and is shown with a readable company and product wordmark.

The public pricing page does not invent subscription rates: it explains that rates are not yet published and that billing is still in development. The Contact page likewise does not link to the placeholder support address.

Expired app sessions attempt one shared refresh request before protected API calls are retried; if the session cannot be refreshed, the user is returned to sign-in. Appearance preferences are stored per user, with an optional owner-managed workspace default. Midnight blue and violet is the default dark palette; users can select other palettes or customize colors. The dashboard uses shared semantic theme tokens, inline tool search, and supports light, dark, or system color mode.

## Implemented screens and runtime behavior

- **Agency and individual accounts:** Individual signup creates one independent workspace. Agency signup creates an agency workspace and reseller record; agency owners can create separate client workspaces and switch between them. Client workspaces isolate brands, content, social accounts, media, and team memberships. Each client workspace inherits the agency workspace subscription status and plan instead of creating another billing subscription. Agency owners can invite client members to a selected client workspace through the existing Team flow.

## Reliability and diagnostics (Batch 0 in progress)

- Video renders use persisted attempts, worker heartbeats, a 30-minute deadline, two automatic retries with backoff, cooperative cancellation, and cleanup of temporary or partial output after normal worker failures. The open render streams stage and percentage updates over server-sent events; queue polling remains active as a fallback.
- Publishing jobs use the existing MySQL queue, refresh their lock heartbeat while a provider call is active, recover stale jobs, and stop after the initial attempt plus two retries. Provider-side outcomes can still be ambiguous if an external platform accepts a request but the network response is lost.
- Workspace owners and admins can open **System Status** to check the database, disk space, FFmpeg/FFprobe, Remotion Chromium, Piper and its configured model, the optional Rhubarb executable, music assets, configured providers, and connected Instagram token validity. The first render may download Remotion's Chrome Headless Shell, and API startup checks do not prevent the server from starting when an optional dependency is missing.
- Browser API calls time out after two minutes by default (five minutes for binary uploads). Only safe reads are automatically retried; writes are not retried automatically to avoid duplicate posts or uploads. A connection banner, route error boundary, and explicit retry actions provide recovery paths. Provider error details are logged server-side and replaced with actionable customer-facing messages for social publishing and account sync.
- Reliability is still being validated. The full database restart/failure-injection tests, resource-pressure safeguards, design/import/analytics background queues, navigation smoke suite, and 20-video/50-design soak test have not been completed. Do not treat this implementation as a production uptime guarantee; see [PROGRESS.md](./PROGRESS.md) for the current gate status.

- **Overview, Create, Content, Designs, and Templates:** working database-backed or navigation flows. Create supports platform previews, first comments, poster copy, and exact template application. Flexible generation offers three distinct style directions; template-driven generation saves one corresponding design. Carousel artwork is a navigable 5–6-page design with an arrow-operated large preview, individual slide downloads, and multi-page PDF export. Brochures and flyers lay out content panels in designed formats. Generated artwork uses the built-in SVG renderer; image-generation providers remain unconfigured.
- **Calendar and Posts and Queue:** create scheduled posts, view status/target results, cancel scheduled posts, retry failed targets, and remove post records from the app. A published post stays on its social platform when its record is removed here; active publishing is protected. The calendar has a styled day-details dialog and date-prefilled create actions. Instagram publishes images, carousels, and Reels to a connected Professional account when OAuth and public media hosting are configured; other platform integrations remain simulated.
- **Social Accounts:** branded platform icons are shown. Instagram Login supports OAuth, encrypted token storage, token refresh, single-image publishing, multi-slide carousel publishing as one swipeable Instagram post, and Instagram Reels publishing. The remaining platform integrations are not enabled.
- **Brand Profile and Brand Kit:** existing onboarding/profile flow.
- **Video Studio:** The Idea to MP4 workflow accepts a short business brief, 1-5 minute duration, language, vertical/horizontal format, conversation tone, three local Piper voices, and a choice of procedural 3D or illustrated characters. Users do not need to create characters: Gemini casts three distinct, editable cartoon personas for each story. The script, character names and looks, dialogue, and scenes can be reviewed and edited before a background render; progress, preview, and download are available, and nothing posts automatically. Gemini uses Google's native `@google/genai` SDK. If its key is missing or generation fails, no fallback copy is saved. The final MP4 is checked for silent gaps and duration drift. The 3D characters are drawn from original procedural geometry; no third-party character models or assets are bundled.
- **Video screenplay limitations:** The local Idea to MP4 voice provider is Piper; Google Gemini, OpenAI, and ElevenLabs speech generation, per-character tone previews, and cost estimates are not implemented. Dialogue timing is aligned to measured speech turns, while mouth movement is an animated talking cue rather than phoneme-accurate lip sync. The procedural characters are not photorealistic and the product does not generate realistic human footage. The Avatar Studio, saved custom characters, artwork import, and user-authored model editing are not implemented. Existing characters or studio designs are not recreated. There is no live interactive conversation: output is a reviewed, queued MP4. The HASNA example and six-industry visual/audio acceptance suite remain outstanding quality gates.
- **3D rendering licenses:** `@remotion/three` (MIT), `@react-three/fiber` (MIT), and Three.js (MIT) provide rendering infrastructure. Characters are original geometry authored in this repository; no external model license or paid avatar service is required. The Remotion core/renderer dependency is under Remotion's separate custom license: its current free tier covers individuals, organizations with up to three employees, and specified nonprofit/evaluation use; other for-profit companies require a company license. Verify eligibility and licensing before selling or deploying the product. Headless rendering requests Chromium's ANGLE WebGL backend; the illustrated style remains selectable as a compatibility fallback.
- **Media Library, Gallery, and Import files:** rendered MP4 playback and downloads are available alongside generated content and design assets. Media Library and Gallery are separate workspace collections; move items between them from the asset details. Gallery includes actions to prepare supported content for posting or download files. The dedicated **Import files** sidebar item opens a focused uploader and imported-file list; the full Media Library also includes the same importer. Import JPEG, PNG, WebP, MP4, or PDF files up to 100 MB each; upload bytes are stored in MySQL so they survive a Render restart. Imported images and MP4s can be prepared with a caption and scheduled for Instagram; PDFs are reference files only, and other social-platform integrations remain simulated. Browser downloads remain in the browser's configured download location. Database storage grows with uploaded media, so remove files you no longer need.
- **Analytics:** dedicated dashboard with verified live publishing counts and publishing activity; views, reach, likes, comments, shares, and clicks are clearly marked unavailable until a platform grants the required insights permissions and endpoints are integrated. Demo-publisher statuses are excluded from live results.
- **Approvals, Content Plans, Inbox, Listening, Team, Billing and Plan, Settings, and super-admin pages:** navigation is present, with feature depth varying by screen.
- To use Gemini locally, add `GOOGLE_AI_STUDIO_API_KEY=your-key` to `apps/api/.env`, optionally set `GOOGLE_AI_STUDIO_MODEL`, and restart the API. Optionally add `GROQ_API_KEY=your-key` and `GROQ_MODEL=llama-3.3-70b-versatile`, then `OPENAI_API_KEY=your-key` and optionally `OPENAI_MODEL=gpt-4o-mini`, for a Gemini → Groq → OpenAI fallback chain. OpenAI API usage may be billable; check the provider's current pricing and project limits before adding a key. Keep all keys on the API server; never add them to web environment variables, client code, or source control. Transient 429/503 errors are retried with bounded backoff; invalid responses are validated and retried before fallback. If all configured providers fail, the app returns an error instead of demo or template copy. Active trials have no app-level monthly AI generation cap; provider limits and the 14-day trial expiry still apply. See Google's [Gemini API text generation](https://ai.google.dev/gemini-api/docs/text-generation) and [structured output](https://ai.google.dev/gemini-api/docs/structured-output) documentation.
- Scheduled post approvals are platform-neutral: the Post Approvals page and grouped email review show each selected channel. Configure the workspace recipient under Settings → Publishing; it defaults to the signed-in account email. When Gmail or Resend is configured in `apps/api/.env`, the recipient receives a grouped preview email as posts enter the next seven-day window. The secure batch link previews every post and allows approving or requesting changes for the whole batch. Unanswered posts remain on hold and receive reminders every 12 hours until their scheduled time; they are never auto-published without approval. Approval links expire after 14 days. Live publishing currently supports Instagram only, and still requires a connected eligible account and supported media.
- Live Instagram publishing uses short-lived signed public-media URLs and converts generated SVG design pages to JPEG for Meta. Carousel pages are uploaded as child media containers and published together as one Instagram carousel with a single caption and hashtag list. Reel videos are served through signed HTTPS URLs and published after Instagram finishes processing their media containers. The API must be reachable over HTTPS from Meta; local `localhost` URLs cannot be fetched by Instagram. OAuth app review, permissions, and account eligibility remain subject to Meta's requirements.
- Video Studio's **Post now** and **Schedule** actions publish videos as Instagram Reels to a connected Instagram Professional account. Before creating a video post, the API checks that `PUBLIC_API_URL` resolves to public IP addresses and its `/health` endpoint responds over HTTPS. Immediate posts begin publishing in the background so the page does not wait through Instagram's media-processing period; check Posts and Queue for the confirmed result or a provider error. Other social-platform video integrations remain simulated and are rejected by the live video publishing flow.
- Piper runs locally without a speech API key. Video Studio includes seven original synthesized music tracks, including two new gentle ambient choices; no third-party samples are used. Pexels stock use is subject to Pexels API terms. Add only music whose license permits your intended use.
- The database and authenticated API flows require a running local MySQL/XAMPP service.
- The local seed creates a workspace administrator and 84 visual composition templates; it does not add a sample company profile or generated sample posts. Keep seed credentials private and replace the documented support/domain placeholders before launch.
- See [PROGRESS.md](./PROGRESS.md) for exact completed work, validation, and remaining batches.
- Current `npm audit` output reports three high-severity issues in Prisma 6's development-only config dependency (`deepmerge-ts`). The suggested automatic fix requires a breaking Prisma upgrade; no unsafe override is applied.
