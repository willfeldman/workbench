# Workbench

From an idea to something you made.

Workbench is an AI workspace for physical projects. Describe an idea, work through a few useful questions, then build from a complete guide with an interactive 3D preview, materials, tools, and source-backed shopping links. Ask follow-up questions or upload progress photos to adapt the project as you go.

## What’s included

- Minimal, responsive conversation and project workspace
- Astra planning, photo understanding, structured guides, and 3D scene generation
- Full guides with short action paragraphs, generated step illustrations, part dimensions, progress, final photos, and print layouts
- Material/tool ownership, pack-aware cost estimates, and researched US retailer links
- Versioned plans, reviewable photo suggestions, undo/restore, and preserved completed work
- Google sign-in with private accounts and image storage using Supabase; optional invitation restriction
- Durable background execution on **Vercel Workflows** — no Trigger.dev account
- Optional AI illustrations using the newest supported model available to the account, independent of the interactive 3D preview
- An explicit example workspace at `/demo`, usable without credentials

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Without service configuration the app opens the example experience; it does not pretend to generate projects.

For a single-user development workspace, set `WORKSHOP_LOCAL_MODE=true` and provide `OPENAI_API_KEY`. Projects and photos are stored in the ignored `.local/` directory. Local mode only works in development and is disabled on Vercel. Local development executes the same generation stages directly; hosted execution checkpoints each stage with Vercel Workflows.

## Hosted setup

1. Create a dedicated Supabase project. Enable Data API and automatic RLS. Do not automatically expose new tables.
2. Apply `supabase/migrations/202609080001_workshop.sql` in the Supabase SQL editor or using the Supabase CLI. This creates private project records, beta membership, usage/event tables, write functions, and private image storage.
3. In Supabase Authentication, enable public signups and keep email confirmation enabled. Set Site URL to the deployment origin and allow `<origin>/auth/callback` and `<origin>/auth/confirm` as redirect URLs.
4. Configure a Google OAuth web client for this app. Use the deployment origin as its authorized JavaScript origin and `https://<project-ref>.supabase.co/auth/v1/callback` as its authorized redirect URI. Enable Google's provider in Supabase with that client ID and secret. Use only basic identity scopes (`openid`, `email`, `profile`) and make the Google OAuth audience available to the intended users. Set server-only `WORKSHOP_GOOGLE_LOGIN=true` in Vercel only after this setup is complete. Google sign-in does not require a custom email domain or SMTP provider.
5. Import this repository into Vercel as a Next.js application. Configure the environment variables below for the target deployment environments. Keep `WORKSHOP_LOCAL_MODE` and `WORKSHOP_TEST_AI` disabled.
6. Deploy. `withWorkflow` generates the workflow endpoints and uses Vercel’s managed infrastructure. No separate worker deployment or worker account is required.
7. Public signup is enabled by default. To restrict project access instead, set `WORKSHOP_INVITE_ONLY=true` and add approved existing auth users’ IDs to `beta_members` through the Supabase dashboard. Email invitations are optional and require custom SMTP with a verified sender for recipients outside the Supabase project team. The admin script `node --import tsx scripts/invite.ts person@example.com` sends an invitation and adds membership; run it only when intentionally inviting someone. For invitation emails, use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` as the confirmation link.
8. Run the service check and a real new project, then verify login, photo ownership, background resumption, sourcing, revisions, and mobile build flow before inviting more users.

OpenAI model requests go directly to OpenAI and are charged to that account. Vercel execution/persistence and Supabase usage are separate. Vercel Workflow does not consume OpenAI credits.

### Environment variables

| Variable                               | Purpose                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project URL                                                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public client key; authorization is enforced by RLS and server checks        |
| `SUPABASE_SERVICE_ROLE_KEY`            | Server-only database/storage access                                          |
| `OPENAI_API_KEY`                       | Server-only OpenAI key                                                       |
| `OPENAI_MODEL`                         | Defaults to `gpt-6-astra`                                                    |
| `OPENAI_IMAGE_MODEL`                   | `auto` selects the newest available supported image model (Sunburst, Flare, then GPT Image 2); an explicit model overrides this |
| `NEXT_PUBLIC_APP_URL`                  | Canonical app origin for authentication                                      |
| `WORKSHOP_DAILY_RUN_LIMIT`             | Daily per-account AI requests; default 4; saved guides remain accessible      |
| `WORKSHOP_UNLIMITED_EMAILS`            | Server-only comma-separated verified emails exempt from the daily cap; usage is still recorded |
| `WORKSHOP_LOCAL_MODE`                  | Explicit local development persistence; default false                        |
| `WORKSHOP_TEST_AI`                     | Deterministic local test fixture; default false, never enabled for users     |
| `WORKSHOP_GOOGLE_LOGIN`                | Server-only sign-in readiness flag; enable after configuring Google in Supabase |
| `WORKSHOP_INVITE_ONLY`                 | Require membership in `beta_members`; default false                          |

Image model availability is account-specific. A model being listed in documentation does not establish account access. `npm run check:services` checks model metadata; a real generation is still needed to verify inference. The app preserves its guide and 3D preview when illustration generation fails. Each generated step image gets a separate Astra consistency review before it is shown. A rejected illustration gets one corrective attempt in a separate durable step; failed images then have an explicit retry control. Images belong to a revision; only unchanged steps can reuse an earlier illustration.

## How it works

A versioned `Spec` connects the brief, constraints, parts, materials, tools, ordered steps, and scene by stable IDs. The scene is validated geometry data, never executable model-generated JavaScript. Three.js renders it in the browser. Dimensions and cost calculations are application-owned; AI supplies proposed project content.

Generation runs through interpretation, guide creation, sourcing, scene creation, and publication. The validated guide opens immediately; step illustrations continue in two background lanes without blocking chat or build progress. Each step image has its own durable checkpoint and revision guard. Each hosted stage is a durable Vercel Workflow step. Drafts are private until validated and published. Sourcing retains only public HTTPS URLs found in the search response. Prices stay unknown when no evidence is available; displayed estimates are explicitly estimates.

Progress and purchase state live outside plan revisions. Revisions preserve history and flag affected completed steps and their dependents for review; listing or price updates alone do not request rework. Photo-inferred changes require acceptance. Compare-and-swap writes prevent lost updates; publication rejects stale base revisions. Request IDs prevent duplicate submission within a project, and account quotas are reserved atomically. Automatic step illustrations are included in their originating request; manual retries use another request.

Supabase tables are not writable by the browser. Server routes verify the current user and confirmed email before any service-role operation, and also require beta membership when `WORKSHOP_INVITE_ONLY=true`. Storage objects use owner/project prefixes and signed URLs. Uploads check image signatures and size. Credentials, local data, generated photos, and environment files are excluded from Git.

The application presents observable stage updates, not private model reasoning. It does not certify engineering, infer exact scale from photos, or export manufacturing-ready CAD. High-stakes construction calls for qualified professional review.

## Checks

```sh
npm run typecheck
npm test
npm run build
# With the development server running and Chrome installed:
npm run test:e2e
# Requires a configured OpenAI key; no key is printed:
npm run check:services
```

Tests cover schema references, malformed meshes, source URL validation, pack quantities, unknown costs, dependencies, revision rework, owner isolation, concurrent updates, desktop/mobile navigation, progress persistence, and honest example-mode behavior.

`node --import tsx scripts/live-smoke.ts` creates a small real local test project and calls OpenAI. This incurs model usage. It must be run only in the development workspace, not as a production health check.

## Release boundaries

This is a private-beta implementation, not a claim that every physical build is independently verified. Before expanding access, review generated projects across woodworking, fabric, paper/cardboard, decor, and low-voltage assembly. Validate material compatibility and actual build outcomes with people familiar with each craft.

Public billing, checkout, collaboration, live camera assistance, native apps, and CAD/fabrication exports are outside this release.
