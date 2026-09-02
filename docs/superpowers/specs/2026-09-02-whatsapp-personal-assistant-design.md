# WhatsApp Personal Assistant — design

**Date:** 2026-09-02
**Repo:** `sakkyb/whatsapp-personal-assistant` (public, MIT)
**Status:** approved, ready for implementation planning

## Purpose

Extract the WhatsApp → Notion inbox from the private `portfolio-20k` site into a
standalone public template that someone else can deploy for themselves in under an
hour, without cloning the repo or opening a terminal.

The origin is `portfolio-20k/app/api/whatsapp/route.ts` + `lib/inbox/*` (~1,100
lines, already working in production). That module is fully self-contained — it has
zero imports outside itself — so extraction is a copy, not a refactor.

### Non-goals

- **Multi-tenancy.** One deploy serves one person. No shared instance, no user table.
- **Google Calendar.** Dropped from v1 (`gcal.ts`, `pending.ts`, the Supabase
  `inbox_pending_actions` table, `scripts/google-oauth.mjs`).
- **Voice notes.** Dropped from v1 (`stt.ts`, `@google-cloud/speech`). Needs a Google
  Cloud project, which doubles the setup cost for one feature.
- **Automating Meta.** The WhatsApp Cloud API setup is ~40 minutes of manual clicking
  in Meta's dashboard. No code can remove it; the README documents it correctly and
  the wizard diagnoses the results.

## Success criteria

1. A competent but non-expert friend goes from zero to a working assistant using only
   the README, a browser, and three account signups.
2. He never runs a terminal command and never sets an env var twice.
3. When something is misconfigured, `/setup` tells him which thing and what to do —
   he does not have to ask the repo owner.
4. Nothing in the public repo leaks the owner's Notion page IDs or any credential.

## Architecture

```
He WhatsApps his Meta test number
        |
Meta WhatsApp Cloud API  --POST-->  /api/whatsapp   (Vercel, Node runtime)
        |
   verify HMAC (WHATSAPP_APP_SECRET) ....... bad -> 401
   sender in WHATSAPP_ALLOWED_SENDERS? ..... no  -> silent 200
        |
   return 200 immediately, work continues in Next's after()
        |
   image? -> fetchMedia -> base64 -> Claude vision
   text?  -> as-is
        |
   runAgent(): Claude tool loop
        add_todo | add_learning | add_musing  -> Notion REST
        |
   reply over WhatsApp with a deep link to where it landed
```

Three services total: **Meta**, **Anthropic**, **Notion**. Four runtime
dependencies: `@anthropic-ai/sdk`, `next`, `react`, `react-dom`.

### File layout

```
app/
  api/whatsapp/route.ts          webhook: GET verification + POST handler
  api/setup/check/route.ts       credential validation
  api/setup/bootstrap/route.ts   creates the Notion page structure
  setup/page.tsx                 the wizard UI
  layout.tsx
lib/inbox/
  agent.ts     Claude tool loop (3 note tools)
  notion.ts    Notion REST client + create/ensure helpers
  whatsapp.ts  signature check, allow-list, media fetch, send
  config.ts    env-driven configuration, no hardcoded IDs
lib/setup/
  checks.ts    one async validator per service, shared by wizard + routes
.env.example
README.md
LICENSE
```

## Components

### `lib/inbox/whatsapp.ts` — unchanged

Copied verbatim. `verifySignature`, `isAllowedSender`, `fetchMedia`, `sendText`.
It is the security boundary and it already works; do not touch it beyond the copy.

### `lib/inbox/config.ts` — de-personalised

- Remove the three hardcoded Notion page IDs (currently `config.ts:28-32` in the
  origin repo — these are the owner's real pages and must not reach a public repo).
- `NOTION_PARENT_PAGE_ID` becomes the single required Notion identifier.
- `TODO_SECTIONS` default changes from `life,focal todo,cohort` to a generic
  `personal,work,someday`, with matching generic hints.
- Drop `USER_TIMEZONE`'s calendar uses; it is still needed for Notion date chips.
- Drop `STT_LANGUAGE_CODE` and `GOOGLE_CALENDAR_ID`.
- Add `PAGE_TITLES = { todo: 'Todo', learning: 'Learnings', musing: 'Musings' }` as
  exported constants. Bootstrap creates pages with these titles and runtime resolution
  looks them up by the same constants, so the two can never drift apart. Renaming a
  page in Notion breaks resolution by design — the failure reply says which title it
  could not find.

### `lib/inbox/notion.ts` — extended

Keeps `findSections`, `appendToDo`, `appendBullet`, `notionDeepLink`. Adds:

- `createPage(parentId, title, icon)` — used by bootstrap.
- `ensureMonthToggle(pageId, monthLabel)` — find the month toggle; create it if
  absent; return its block id.
- `findChildPageByTitle(parentId, title)` — used by both bootstrap idempotency and
  runtime page resolution.

### `lib/inbox/agent.ts` — trimmed and de-rotted

- Remove `find_events`, `create_event`, `update_event`, `delete_event` and the
  calendar half of `Ctx`. `Ctx` becomes `{ todoCandidates: Section[] }`.
- Remove the `pending` return path; `AgentResult` becomes `{ reply: string }`.
- **Derive the year from the clock.** The origin hardcodes `2026` at three places
  (`agent.ts:91`, `:229`, `:234`). A public template shipping a literal year rots on
  1 January. Use `new Date().getFullYear()` in tool descriptions and reply text.
- **Self-heal the month toggle.** The origin does `section?.id || pageId`
  (`agent.ts:90`), which silently appends to the page root when the current month's
  toggle does not exist. The owner's pages have toggles pre-built so this never
  fires; a fresh install would hit it the first time the month rolls over. Replace
  with `ensureMonthToggle()`.

### Page resolution — resolve by title, not by env

The three page IDs do not exist until bootstrap has run on the deployed app, so
requiring them as env vars would force a *deploy → setup → paste IDs → redeploy*
cycle. Instead:

- Only `NOTION_PARENT_PAGE_ID` is configured.
- At runtime the agent resolves the Todo / Learnings / Musings pages by title
  underneath the parent, via `findChildPageByTitle`.
- Results are cached in module scope, so the lookup costs one extra Notion call on a
  cold start, not one per message.
- If a page is missing, the reply names it and points at `/setup`.

He sets his environment variables exactly once.

### `app/api/whatsapp/route.ts` — trimmed

Keeps `GET` verification, HMAC check, allow-list, instant-ack + `after()`, text
handling, image handling, and the error reply. Removes the audio branch, the
pending/confirmation branch, and `applyPending`.

**Images stay.** They cost nothing extra: `fetchMedia` needs only the WhatsApp
token, and vision is the Anthropic key that is already required. Only *voice*
needed Google.

### The wizard — `/setup`

Gated by `SETUP_SECRET`, compared in constant time.

- **The gate lives on the API routes, not only the page.** `/api/setup/check` and
  `/api/setup/bootstrap` each validate the secret independently. Gating only the UI
  would leave `POST /api/setup/bootstrap` open to anyone, able to create pages in his
  Notion workspace.
- **Wrong key, or `SETUP_SECRET` unset, returns 404** from both the page and the API
  routes — indistinguishable from a route that does not exist. Unsetting the variable
  once setup is done therefore removes the entire surface permanently.
- **The secret travels as `?key=...`.** Accepted tradeoff: it lands in browser history
  and Vercel access logs. The secret is rotatable and used a handful of times. A
  password form setting an httpOnly cookie is the alternative if this proves annoying.
- **Never render a credential value**, masked or otherwise. The checklist shows
  set / not-set booleans only.

Four sections:

1. **Environment checklist** — every required variable, present or missing.
2. **Credential tests**, one button each, backed by `lib/setup/checks.ts`:
   - Anthropic: a 1-token call.
   - Notion: `GET /v1/users/me` (shows the integration name), then confirm
     `NOTION_PARENT_PAGE_ID` is readable — this is the check that catches "you forgot
     to share the page with the integration", the most common Notion failure.
   - WhatsApp: `GET /v{version}/{phone_number_id}`. Must special-case an expired
     token with plain English — the 24-hour temporary token silently expiring is the
     single most likely way this dies a day after it starts working.
3. **Create my Notion pages** — runs bootstrap, reports what it made. Idempotent:
   `findChildPageByTitle` first, so a double click cannot duplicate.
4. **Webhook helper** — displays the exact callback URL, derived from the request
   host, plus verify-token status, ready to paste into Meta.

### Bootstrap

Inside `NOTION_PARENT_PAGE_ID`, create (skipping anything already present):

- **Todo** — one heading per entry in `TODO_SECTIONS`.
- **Learnings** — a toggle for the current month.
- **Musings** — a toggle for the current month.

Later months are created on demand by `ensureMonthToggle`, so bootstrap does not
need to pre-build twelve toggles or know about future years.

## Error handling

| Condition | Behaviour |
|---|---|
| Bad/missing HMAC signature | `401`, nothing processed |
| Sender not in allow-list | Silent `200` |
| Unhandled message type | Silent `200` |
| Empty allow-list | Fail closed — nobody is allowed |
| Failure inside `after()` | WhatsApp reply `⚠️ Couldn't handle that`, logged |
| Required env var missing | Webhook replies naming the variable and pointing at `/setup` |
| Notion page not found at runtime | Reply names the missing page, points at `/setup` |
| Bootstrap failure | Notion's own error surfaced verbatim in the wizard |

## Testing

The origin has no tests, which is defensible for a personal deploy and not for code
strangers will run. Minimal and proportionate — cover the pure, security-critical
functions only:

- `verifySignature` — valid signature, tampered body, missing header, absent secret.
- `isAllowedSender` — allow-list parsing, whitespace, and empty list failing closed.
- Year and month derivation — correct labels, and a December→January rollover.

No integration harness against Meta, Notion or Anthropic.

Runner: **Vitest**, as the single dev dependency that handles TypeScript without
configuration. `npm test` runs it. Four runtime dependencies stays the headline
number; this does not ship to production.

## README structure

1. What it does, with the flow diagram
2. What you need: 3 accounts, ~45 minutes, running cost near zero
3. Deploy to Vercel
4. Notion: create the integration, create **one** parent page, share it
5. Open `/setup`, run the checks, create the pages
6. Meta setup — the seven steps, **in the order that actually works**
7. Send a test message
8. Troubleshooting
9. Customising your to-do sections
10. Cost and security notes

### Three gotchas the README must state explicitly

1. **Deploy before configuring the Meta webhook.** Meta calls `GET /api/whatsapp` and
   expects the challenge echoed back, so the app must already be live with
   `WHATSAPP_VERIFY_TOKEN` set. Documented in the wrong order, he gets stuck on
   "Verify and save" with no idea why.
2. **Do not register your own phone number.** A number attached to the Cloud API can
   no longer be used in the normal WhatsApp app. Use Meta's free test number and
   message it from your personal WhatsApp.
3. **The temporary token expires in 24 hours.** Create a System User token with
   `whatsapp_business_messaging`. This is not optional, and it is the failure that
   looks exactly like "the code is broken".

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Powers the agent |
| `NOTION_TOKEN` | yes | Internal integration secret |
| `NOTION_PARENT_PAGE_ID` | yes | The one page shared with the integration |
| `WHATSAPP_VERIFY_TOKEN` | yes | Any random string; must match Meta |
| `WHATSAPP_APP_SECRET` | yes | Verifies Meta's request signature |
| `WHATSAPP_TOKEN` | yes | System User token, not the temporary one |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | From WhatsApp → API Setup |
| `WHATSAPP_ALLOWED_SENDERS` | yes | Digits incl. country code, comma separated |
| `SETUP_SECRET` | yes | Gates the wizard; unset it to disable setup entirely |
| `NOTION_TODO_SECTIONS` | no | Default `personal,work,someday` |
| `USER_TIMEZONE` | no | Default `Europe/London` |
| `INBOX_MODEL` | no | Default `claude-haiku-4-5-20251001` |
| `WHATSAPP_GRAPH_VERSION` | no | Default `v21.0` |

## Risks

- **Meta's dashboard changes.** The README's Meta section will drift; it is the most
  fragile part of the repo and cannot be tested in CI.
- **The test number caps at 5 verified recipients.** Fine for personal use; the README
  should say so rather than let someone discover it while onboarding friends.
- **Notion structure drift.** If he renames a page, runtime title resolution stops
  finding it. Mitigated by naming the missing page in the failure reply.
- **Public repo, owner's history.** The extraction must be a fresh repo with a fresh
  first commit, never a filtered clone of `portfolio-20k`, so no private history or
  page IDs come along.
