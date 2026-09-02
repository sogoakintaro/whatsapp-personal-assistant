# WhatsApp Personal Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sakkyb/whatsapp-personal-assistant` — a public MIT template that files WhatsApp messages into Notion, deployable by a stranger in under an hour without ever opening a terminal.

**Architecture:** A Next.js app on Vercel with two surfaces. `/api/whatsapp` is the Meta webhook: verify HMAC, check the sender allow-list, ack instantly, then run a Claude tool-use loop that appends to Notion via REST. `/setup` is a secret-gated wizard that validates credentials and bootstraps the Notion page structure, so the deployer sets environment variables exactly once.

**Tech Stack:** Next.js 15 (App Router, Node runtime), TypeScript, `@anthropic-ai/sdk`, Notion REST API v1, WhatsApp Cloud API (Graph v21.0), Vitest.

**Source material:** Transplanted from a working private deployment of the same assistant (`app/api/whatsapp/route.ts` + `lib/inbox/*`, ~1,100 lines in production). Read `docs/superpowers/specs/2026-09-02-whatsapp-personal-assistant-design.md` before starting.

## Global Constraints

- **Node 20+.** `package.json` sets `"engines": { "node": ">=20" }`.
- **Next `^15.1.0`** — required for stable `after()`. Do not downgrade.
- **Exactly four runtime dependencies:** `@anthropic-ai/sdk`, `next`, `react`, `react-dom`. Adding a fifth needs a decision, not a commit.
- **Dev dependencies:** `typescript`, `@types/node`, `@types/react`, `vitest`. Nothing else.
- **Code style matches the origin repo:** TypeScript, 2-space indent, single quotes, **no semicolons**.
- **Never log, render, or return a credential value** — not masked, not truncated. Booleans only.
- **No hardcoded year and no hardcoded Notion page IDs** anywhere. Both are template rot.
- **Every commit message ends with:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017JXYYwjwcd65DwrYP7KPLm
  ```
- **Required-env reads must be lazy** (inside functions, never at module top level). If `config.ts` throws on import, `/setup` cannot load to tell the user what is missing — which defeats the wizard's entire purpose.

## File Structure

| File | Responsibility |
|---|---|
| `lib/inbox/config.ts` | Env-driven constants, page titles, lazy env accessors |
| `lib/inbox/dates.ts` | Timezone-aware month label and year (pure, tested) |
| `lib/inbox/whatsapp.ts` | Signature check, allow-list, media fetch, send reply |
| `lib/inbox/notion.ts` | Notion REST client, section discovery, append, create, ensure |
| `lib/inbox/pages.ts` | Resolve Todo/Learnings/Musings by title, cached |
| `lib/inbox/agent.ts` | Claude tool-use loop with three note tools |
| `app/api/whatsapp/route.ts` | Webhook: GET verification, POST handler |
| `lib/setup/gate.ts` | Constant-time `SETUP_SECRET` comparison |
| `lib/setup/checks.ts` | One async validator per service |
| `app/api/setup/check/route.ts` | Runs validators behind the gate |
| `app/api/setup/bootstrap/route.ts` | Creates the Notion structure behind the gate |
| `app/setup/page.tsx` | The wizard UI |
| `README.md`, `.env.example`, `LICENSE` | Setup guidance |

**Two refinements to the spec's layout, both deliberate:**
- `dates.ts` is split out so month/year derivation is pure and testable without touching Notion.
- The spec named `ensureMonthToggle`; it is generalised to `ensureSection(pageId, label, type)` because bootstrap needs to create *headings* on the Todo page as well as *toggles* on Learnings and Musings. One function, two call sites.

---

### Task 1: Scaffold the repo

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `LICENSE`, `app/layout.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: a buildable Next app; `npm test` and `npm run build` both succeed

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "whatsapp-personal-assistant",
  "version": "1.0.0",
  "private": false,
  "license": "MIT",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.65.0",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.mjs` and `vitest.config.ts`**

```javascript
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {}
export default nextConfig
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create `LICENSE`**

Write the standard MIT License text, `Copyright (c) 2026 Sakshat Baral`.

- [ ] **Step 5: Create `app/layout.tsx` and `app/page.tsx`**

```tsx
// app/layout.tsx
export const metadata = {
  title: 'WhatsApp Personal Assistant',
  description: 'Text yourself a note, and it files itself into Notion.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#fafafa', color: '#111' }}>
        {children}
      </body>
    </html>
  )
}
```

```tsx
// app/page.tsx
export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '4rem 1.5rem', lineHeight: 1.6 }}>
      <h1>WhatsApp Personal Assistant</h1>
      <p>
        Text yourself a note on WhatsApp and it files itself into Notion as a to-do,
        a learning, or a musing.
      </p>
      <p>
        This deployment is set up at <code>/setup</code> (you need the setup key).
        Source and instructions:{' '}
        <a href="https://github.com/sakkyb/whatsapp-personal-assistant">GitHub</a>.
      </p>
    </main>
  )
}
```

- [ ] **Step 6: Install and verify the build**

Run: `npm install && npm run build`
Expected: build succeeds, `.next/` produced.

- [ ] **Step 7: Verify the test runner starts**

Run: `npm test`
Expected: exits 0 reporting "No test files found" (no tests exist yet).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with MIT licence and Vitest"
```

---

### Task 2: Configuration and date helpers

**Files:**
- Create: `lib/inbox/config.ts`, `lib/inbox/dates.ts`
- Test: `lib/inbox/config.test.ts`, `lib/inbox/dates.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `NOTION_VERSION: string`, `NOTION_APPEND_VERSION: string`, `GRAPH_VERSION: string`, `USER_TIMEZONE: string`
  - `PAGE_TITLES: { todo: 'Todo'; learning: 'Learnings'; musing: 'Musings' }`
  - `TODO_SECTIONS: string[]`, `TODO_SECTION_HINTS: Record<string, string>`
  - `parseSections(raw: string | undefined): string[]`
  - `requireEnv(name: string): string`
  - `MONTHS: string[]`, `currentMonthLabel(timeZone: string, now?: Date): string`, `currentYear(timeZone: string, now?: Date): number`

- [ ] **Step 1: Write the failing tests for `dates.ts`**

```typescript
// lib/inbox/dates.test.ts
import { describe, it, expect } from 'vitest'
import { currentMonthLabel, currentYear, MONTHS } from './dates'

describe('dates', () => {
  it('has twelve month names starting at January', () => {
    expect(MONTHS).toHaveLength(12)
    expect(MONTHS[0]).toBe('January')
    expect(MONTHS[11]).toBe('December')
  })

  it('returns the month in the given timezone', () => {
    const d = new Date('2026-06-15T12:00:00Z')
    expect(currentMonthLabel('Europe/London', d)).toBe('June')
  })

  it('returns the year in the given timezone', () => {
    const d = new Date('2026-06-15T12:00:00Z')
    expect(currentYear('Europe/London', d)).toBe(2026)
  })

  // The rollover case: the same instant is December in London and January in
  // Auckland. A server-clock implementation would file a January note under
  // December for anyone east of UTC.
  it('rolls over month and year by timezone, not by server clock', () => {
    const nye = new Date('2025-12-31T23:30:00Z')
    expect(currentMonthLabel('Europe/London', nye)).toBe('December')
    expect(currentYear('Europe/London', nye)).toBe(2025)
    expect(currentMonthLabel('Pacific/Auckland', nye)).toBe('January')
    expect(currentYear('Pacific/Auckland', nye)).toBe(2026)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/inbox/dates.test.ts`
Expected: FAIL — cannot resolve `./dates`.

- [ ] **Step 3: Implement `lib/inbox/dates.ts`**

```typescript
// Month and year derived from a timezone rather than the server clock. Vercel
// runs in UTC, so a server-clock reading files a note under the wrong month for
// anyone whose local date has already turned over.

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function currentMonthLabel(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, month: 'long' }).format(now)
}

export function currentYear(timeZone: string, now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric' }).format(now))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/inbox/dates.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing tests for `config.ts`**

```typescript
// lib/inbox/config.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { parseSections, requireEnv, PAGE_TITLES } from './config'

describe('parseSections', () => {
  it('falls back to generic defaults when unset', () => {
    expect(parseSections(undefined)).toEqual(['personal', 'work', 'someday'])
    expect(parseSections('')).toEqual(['personal', 'work', 'someday'])
  })

  it('splits, trims and drops empties', () => {
    expect(parseSections(' home , admin ,, side project ')).toEqual(['home', 'admin', 'side project'])
  })
})

describe('requireEnv', () => {
  afterEach(() => {
    delete process.env.SOME_TEST_VAR
  })

  it('returns the value when set', () => {
    process.env.SOME_TEST_VAR = 'hello'
    expect(requireEnv('SOME_TEST_VAR')).toBe('hello')
  })

  it('throws naming the missing variable', () => {
    expect(() => requireEnv('SOME_TEST_VAR')).toThrow(/SOME_TEST_VAR/)
  })

  it('treats blank as missing', () => {
    process.env.SOME_TEST_VAR = '   '
    expect(() => requireEnv('SOME_TEST_VAR')).toThrow(/SOME_TEST_VAR/)
  })
})

describe('PAGE_TITLES', () => {
  it('pins the titles bootstrap creates and runtime resolves', () => {
    expect(PAGE_TITLES).toEqual({ todo: 'Todo', learning: 'Learnings', musing: 'Musings' })
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run lib/inbox/config.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 7: Implement `lib/inbox/config.ts`**

```typescript
// Configuration for the WhatsApp → Notion inbox.
//
// Nothing here is personal to any one deployment: every identifier comes from
// the environment. Required values are read through requireEnv() *inside
// functions* so that importing this module never throws — /setup has to be able
// to load in order to report what is missing.

export const NOTION_VERSION = '2022-06-28'
// Inserting a block at the top of a list (`position: { type: 'start' }`) is only
// supported from this API version onward.
export const NOTION_APPEND_VERSION = '2025-09-03'
export const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'

// IANA timezone used for date chips and for deciding which month a note belongs to.
export const USER_TIMEZONE = process.env.USER_TIMEZONE || 'Europe/London'

// Titles bootstrap creates and runtime resolves by. These two must never drift,
// so both read them from here.
export const PAGE_TITLES = {
  todo: 'Todo',
  learning: 'Learnings',
  musing: 'Musings',
} as const

export type PageKey = keyof typeof PAGE_TITLES

const DEFAULT_SECTIONS = ['personal', 'work', 'someday']

export function parseSections(raw: string | undefined): string[] {
  const parsed = (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return parsed.length ? parsed : DEFAULT_SECTIONS
}

// To-do sub-lists, resolved live from the Todo page by matching heading text.
export const TODO_SECTIONS = parseSections(process.env.NOTION_TODO_SECTIONS)

// Optional routing hints for the classifier, keyed case-insensitively.
export const TODO_SECTION_HINTS: Record<string, string> = {
  personal: 'home, family, health, admin, errands',
  work: 'your job, projects, meetings, follow-ups',
  someday: 'ideas and things with no deadline',
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable ${name}. Open /setup to see what else is unset.`)
  }
  return value
}

export function parentPageId(): string {
  return requireEnv('NOTION_PARENT_PAGE_ID')
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, 10 tests across both files.

- [ ] **Step 9: Commit**

```bash
git add lib/inbox/config.ts lib/inbox/dates.ts lib/inbox/config.test.ts lib/inbox/dates.test.ts
git commit -m "feat: env-driven config and timezone-aware date helpers"
```

---

### Task 3: WhatsApp client and its security tests

**Files:**
- Create: `lib/inbox/whatsapp.ts`
- Test: `lib/inbox/whatsapp.test.ts`

**Interfaces:**
- Consumes: `GRAPH_VERSION` from `lib/inbox/config.ts`
- Produces:
  - `verifySignature(rawBody: string, header: string | null): boolean`
  - `isAllowedSender(from: string): boolean`
  - `fetchMedia(mediaId: string): Promise<{ bytes: Buffer; mimeType: string }>`
  - `sendText(to: string, body: string): Promise<void>`

This is the security boundary. Copy it verbatim from the origin — it is in production and correct. The new work is the tests.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/inbox/whatsapp.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { verifySignature, isAllowedSender } from './whatsapp'

const SECRET = 'test-app-secret'
const BODY = '{"entry":[{"changes":[]}]}'

function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

describe('verifySignature', () => {
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = SECRET
  })
  afterEach(() => {
    delete process.env.WHATSAPP_APP_SECRET
  })

  it('accepts a correctly signed body', () => {
    expect(verifySignature(BODY, sign(BODY))).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(verifySignature(BODY + ' ', sign(BODY))).toBe(false)
  })

  it('rejects a signature made with the wrong secret', () => {
    expect(verifySignature(BODY, sign(BODY, 'wrong-secret'))).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(verifySignature(BODY, null)).toBe(false)
  })

  it('rejects a header without the sha256= prefix', () => {
    expect(verifySignature(BODY, sign(BODY).replace('sha256=', ''))).toBe(false)
  })

  it('rejects a truncated signature without throwing on length mismatch', () => {
    expect(verifySignature(BODY, sign(BODY).slice(0, 20))).toBe(false)
  })

  it('fails closed when the app secret is unset', () => {
    delete process.env.WHATSAPP_APP_SECRET
    expect(verifySignature(BODY, sign(BODY))).toBe(false)
  })
})

describe('isAllowedSender', () => {
  afterEach(() => {
    delete process.env.WHATSAPP_ALLOWED_SENDERS
  })

  it('fails closed when the allow-list is unset', () => {
    expect(isAllowedSender('447700900123')).toBe(false)
  })

  it('fails closed when the allow-list is empty', () => {
    process.env.WHATSAPP_ALLOWED_SENDERS = '  , ,'
    expect(isAllowedSender('447700900123')).toBe(false)
  })

  it('allows a listed sender', () => {
    process.env.WHATSAPP_ALLOWED_SENDERS = '447700900123'
    expect(isAllowedSender('447700900123')).toBe(true)
  })

  it('rejects an unlisted sender', () => {
    process.env.WHATSAPP_ALLOWED_SENDERS = '447700900123'
    expect(isAllowedSender('447700900999')).toBe(false)
  })

  it('ignores formatting in both the list and the sender', () => {
    process.env.WHATSAPP_ALLOWED_SENDERS = '+44 7700 900123, +1 (555) 010-9999'
    expect(isAllowedSender('447700900123')).toBe(true)
    expect(isAllowedSender('15550109999')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/inbox/whatsapp.test.ts`
Expected: FAIL — cannot resolve `./whatsapp`.

- [ ] **Step 3: Implement `lib/inbox/whatsapp.ts`**

```typescript
// WhatsApp Cloud API helpers: webhook signature verification, sender allow-list,
// media download, and sending a text reply via the Graph API.

import crypto from 'crypto'
import { GRAPH_VERSION } from './config'

// Verifies Meta's X-Hub-Signature-256 header against the raw request body using
// the app secret. Returns false (fail-closed) if anything is missing.
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret || !header || !header.startsWith('sha256=')) return false

  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Only senders listed in WHATSAPP_ALLOWED_SENDERS (comma-separated, any format)
// may write to Notion. Fail-closed: an empty list blocks everyone.
export function isAllowedSender(from: string): boolean {
  const allow = (process.env.WHATSAPP_ALLOWED_SENDERS || '')
    .split(',')
    .map((s) => s.replace(/\D/g, ''))
    .filter(Boolean)
  if (allow.length === 0) return false
  return allow.includes(from.replace(/\D/g, ''))
}

// Downloads an inbound media object (e.g. a photo) by its media id. The Graph
// API hands back a short-lived, authenticated CDN URL first; the same bearer
// token is then required to pull the actual bytes.
export async function fetchMedia(mediaId: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const token = process.env.WHATSAPP_TOKEN
  if (!token) throw new Error('Missing WHATSAPP_TOKEN')

  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!metaRes.ok) {
    throw new Error(`WhatsApp media lookup ${mediaId} → ${metaRes.status}: ${await metaRes.text()}`)
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string }
  if (!meta.url) throw new Error('WhatsApp media response had no download url')

  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!binRes.ok) {
    throw new Error(`WhatsApp media download → ${binRes.status}: ${await binRes.text()}`)
  }
  const bytes = Buffer.from(await binRes.arrayBuffer())
  return { bytes, mimeType: meta.mime_type || 'application/octet-stream' }
}

// Sends a plain-text WhatsApp message back to the sender. Link previews are on
// so the Notion link renders nicely.
export async function sendText(to: string, body: string): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_TOKEN
  if (!phoneId || !token) throw new Error('Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TOKEN')

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body, preview_url: true },
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    console.error('WhatsApp send failed', res.status, t)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, 22 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/inbox/whatsapp.ts lib/inbox/whatsapp.test.ts
git commit -m "feat: WhatsApp client with signature and allow-list tests"
```

---

### Task 4: Notion client with create and ensure helpers

**Files:**
- Create: `lib/inbox/notion.ts`

**Interfaces:**
- Consumes: `NOTION_VERSION`, `NOTION_APPEND_VERSION`, `USER_TIMEZONE` from `lib/inbox/config.ts`
- Produces:
  - `type Section = { label: string; id: string; type: string }`
  - `findSections(pageId: string, maxDepth?: number): Promise<Section[]>`
  - `findByLabel(sections: Section[], label?: string): Section | undefined`
  - `appendToDo(parentId: string, text: string, date?: string): Promise<any>`
  - `appendBullet(parentId: string, text: string): Promise<any>`
  - `notionDeepLink(pageId: string, blockId?: string): string`
  - `createPage(parentId: string, title: string, emoji?: string): Promise<string>` — returns the new page id
  - `findChildPageByTitle(parentId: string, title: string): Promise<string | null>`
  - `ensureSection(pageId: string, label: string, type: 'toggle' | 'heading_3'): Promise<string>` — returns the section's block id
  - `notionUserName(): Promise<string>` — for the wizard's Notion check

The first six are copied from the origin. The last four are new.

- [ ] **Step 1: Create `lib/inbox/notion.ts` with the copied client**

```typescript
// Minimal Notion REST client (no extra dependency) for reading page structure,
// appending blocks, and creating the pages this assistant files into.
// Auth uses an internal integration token in NOTION_TOKEN.

import { NOTION_VERSION, NOTION_APPEND_VERSION, USER_TIMEZONE } from './config'

const NOTION_API = 'https://api.notion.com/v1'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

async function notion(path: string, init?: RequestInit): Promise<Json> {
  const token = process.env.NOTION_TOKEN
  if (!token) throw new Error('Missing NOTION_TOKEN')

  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Notion ${init?.method || 'GET'} ${path} → ${res.status}: ${body}`)
  }
  return res.json()
}

// Block types that carry a human-readable label we can route on.
const LABELLED_TYPES = ['toggle', 'heading_1', 'heading_2', 'heading_3']
// Structural wrappers we descend through to find labelled sections.
const CONTAINER_TYPES = ['column_list', 'column', 'synced_block']

function plainText(rich: Json[] | undefined): string {
  return (rich || []).map((r) => r.plain_text ?? r.text?.content ?? '').join('')
}

function blockLabel(block: Json): string | null {
  if (LABELLED_TYPES.includes(block.type)) {
    return plainText(block[block.type]?.rich_text).trim()
  }
  return null
}

async function getChildren(blockId: string): Promise<Json[]> {
  const blocks: Json[] = []
  let cursor: string | undefined
  do {
    const qs = new URLSearchParams({ page_size: '100' })
    if (cursor) qs.set('start_cursor', cursor)
    const data = await notion(`/blocks/${blockId}/children?${qs.toString()}`)
    blocks.push(...(data.results || []))
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
  return blocks
}

export type Section = { label: string; id: string; type: string }

// Walk a page and collect every labelled section (toggles + headings). We stop
// descending once we hit a labelled block, which prunes the (potentially huge)
// list of to-do items underneath each section.
export async function findSections(pageId: string, maxDepth = 5): Promise<Section[]> {
  const out: Section[] = []

  async function walk(blockId: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    let children: Json[]
    try {
      children = await getChildren(blockId)
    } catch (err) {
      console.error('findSections: could not read children of', blockId, err)
      return
    }
    for (const b of children) {
      const label = blockLabel(b)
      if (label) {
        out.push({ label, id: b.id, type: b.type })
        continue // don't recurse into a labelled section
      }
      if (CONTAINER_TYPES.includes(b.type) && b.has_children) {
        await walk(b.id, depth + 1)
      }
    }
  }

  await walk(pageId, 0)
  return out
}

// Case-insensitive section lookup. Lives here because both the agent and
// ensureSection need it.
export function findByLabel(sections: Section[], label?: string): Section | undefined {
  if (!label) return undefined
  return sections.find((s) => s.label.toLowerCase() === label.toLowerCase())
}

function richText(content: string) {
  // Notion caps a single rich-text item at 2000 characters.
  return [{ type: 'text', text: { content: content.slice(0, 2000) } }]
}

// An inline date "@mention" — the blue date chip you'd otherwise type with
// "@today". `date` is a naive-local YYYY-MM-DD (all-day) or
// YYYY-MM-DDTHH:MM:SS (with a time). Note: the public API can attach the chip
// but cannot arm the reminder — that stays a manual tap in Notion.
function dateMention(date: string): Json {
  const hasTime = date.length > 10
  const dateObj: Json = { start: date, end: null }
  if (hasTime) dateObj.time_zone = USER_TIMEZONE
  return { type: 'mention', mention: { type: 'date', date: dateObj } }
}

function toDoRichText(text: string, date?: string): Json[] {
  const rich: Json[] = richText(text)
  if (date) {
    rich.push({ type: 'text', text: { content: ' ' } })
    rich.push(dateMention(date))
  }
  return rich
}

// Where in the parent's children list to place the new block. Omitting it keeps
// Notion's default (append to the end).
type Position = { type: 'start' } | { type: 'end' } | { type: 'after_block'; after_block: { id: string } }

async function appendChild(parentId: string, child: Json, position?: Position): Promise<Json> {
  const body: Json = { children: [child] }
  if (position) body.position = position
  const data = await notion(`/blocks/${parentId}/children`, {
    method: 'PATCH',
    // `position` requires the newer API version; scope it to this request only.
    headers: position ? { 'Notion-Version': NOTION_APPEND_VERSION } : undefined,
    body: JSON.stringify(body),
  })
  return data.results?.[0]
}

// New to-dos go to the top of the list (newest first). Pass `date` to append an
// inline date chip (naive-local YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS).
export function appendToDo(parentId: string, text: string, date?: string): Promise<Json> {
  return appendChild(
    parentId,
    {
      object: 'block',
      type: 'to_do',
      to_do: { rich_text: toDoRichText(text, date), checked: false },
    },
    { type: 'start' },
  )
}

export function appendBullet(parentId: string, text: string): Promise<Json> {
  return appendChild(parentId, {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richText(text) },
  })
}

// Builds a link that opens the page (and jumps to the new block when given).
export function notionDeepLink(pageId: string, blockId?: string): string {
  const page = pageId.replace(/-/g, '')
  if (!blockId) return `https://www.notion.so/${page}`
  return `https://www.notion.so/${page}#${blockId.replace(/-/g, '')}`
}
```

- [ ] **Step 2: Append the new bootstrap and resolution helpers to `lib/inbox/notion.ts`**

```typescript
// ── Creating structure (used by /setup bootstrap) ────────────────────────────

// Creates a child page under `parentId` and returns its page id.
export async function createPage(parentId: string, title: string, emoji?: string): Promise<string> {
  const body: Json = {
    parent: { page_id: parentId },
    properties: { title: { title: richText(title) } },
  }
  if (emoji) body.icon = { type: 'emoji', emoji }
  const page = await notion('/pages', { method: 'POST', body: JSON.stringify(body) })
  return page.id as string
}

// Finds a direct child page by exact (case-insensitive) title. Returns null if
// absent, so callers can decide whether to create or to fail.
export async function findChildPageByTitle(parentId: string, title: string): Promise<string | null> {
  const children = await getChildren(parentId)
  const match = children.find(
    (b) => b.type === 'child_page' && String(b.child_page?.title || '').trim().toLowerCase() === title.toLowerCase(),
  )
  return match ? (match.id as string) : null
}

// Finds a labelled section on a page, creating it if it isn't there yet, and
// returns its block id.
//
// This is what stops the assistant rotting. The original silently fell back to
// appending at the page root when the current month's toggle was missing, which
// works only because those toggles were built by hand in advance. A fresh
// install has no toggle for next month, so it must create one on demand.
export async function ensureSection(
  pageId: string,
  label: string,
  type: 'toggle' | 'heading_3',
): Promise<string> {
  const existing = findByLabel(await findSections(pageId), label)
  if (existing) return existing.id

  const block: Json = {
    object: 'block',
    type,
    [type]: { rich_text: richText(label) },
  }
  // Newest month first on note pages; to-do headings keep document order.
  const created = await appendChild(pageId, block, type === 'toggle' ? { type: 'start' } : undefined)
  if (!created?.id) throw new Error(`Notion did not return a block id when creating section "${label}"`)
  return created.id as string
}

// The integration's own name — used by /setup to prove NOTION_TOKEN works.
export async function notionUserName(): Promise<string> {
  const me = await notion('/users/me')
  return (me?.name as string) || (me?.bot?.owner?.type as string) || 'integration'
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify existing tests still pass**

Run: `npx vitest run`
Expected: PASS, 22 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/inbox/notion.ts
git commit -m "feat: Notion client with page creation and self-healing sections"
```

---

### Task 5: Resolve pages by title

**Files:**
- Create: `lib/inbox/pages.ts`
- Test: `lib/inbox/pages.test.ts`

**Interfaces:**
- Consumes: `PAGE_TITLES`, `parentPageId` from `config.ts`; `findChildPageByTitle` from `notion.ts`
- Produces:
  - `type PageIds = { todo: string; learning: string; musing: string }`
  - `class MissingPageError extends Error` with a `title: string` property
  - `resolvePages(): Promise<PageIds>`
  - `clearPageCache(): void` — test seam

Resolving by title is what lets the deployer set environment variables exactly once: the page ids do not exist until bootstrap has run, and requiring them as env vars would force a second deploy.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/inbox/pages.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolvePages, clearPageCache, MissingPageError } from './pages'
import * as notion from './notion'

describe('resolvePages', () => {
  beforeEach(() => {
    process.env.NOTION_PARENT_PAGE_ID = 'parent-123'
    clearPageCache()
  })
  afterEach(() => {
    delete process.env.NOTION_PARENT_PAGE_ID
    vi.restoreAllMocks()
  })

  it('resolves all three pages by title', async () => {
    vi.spyOn(notion, 'findChildPageByTitle').mockImplementation(async (_parent, title) => `id-${title}`)
    const pages = await resolvePages()
    expect(pages).toEqual({ todo: 'id-Todo', learning: 'id-Learnings', musing: 'id-Musings' })
  })

  it('caches so repeated messages do not re-query Notion', async () => {
    const spy = vi.spyOn(notion, 'findChildPageByTitle').mockImplementation(async (_p, title) => `id-${title}`)
    await resolvePages()
    await resolvePages()
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('throws MissingPageError naming the page that is absent', async () => {
    vi.spyOn(notion, 'findChildPageByTitle').mockImplementation(async (_p, title) =>
      title === 'Musings' ? null : `id-${title}`,
    )
    await expect(resolvePages()).rejects.toThrow(MissingPageError)
    await expect(resolvePages()).rejects.toThrow(/Musings/)
  })

  it('does not cache a failed resolution', async () => {
    const spy = vi
      .spyOn(notion, 'findChildPageByTitle')
      .mockImplementationOnce(async () => null)
      .mockImplementation(async (_p, title) => `id-${title}`)
    await expect(resolvePages()).rejects.toThrow(MissingPageError)
    const pages = await resolvePages()
    expect(pages.todo).toBe('id-Todo')
    expect(spy.mock.calls.length).toBeGreaterThan(3)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/inbox/pages.test.ts`
Expected: FAIL — cannot resolve `./pages`.

- [ ] **Step 3: Implement `lib/inbox/pages.ts`**

```typescript
// Resolves the three Notion pages this assistant writes into, by title, under
// the one page the user shared with the integration.
//
// Why by title and not by id: the pages don't exist until /setup has run on the
// deployed app. Configuring their ids would mean deploy → setup → paste ids →
// redeploy. Resolving by title means the environment is set once and never
// touched again.

import { PAGE_TITLES, parentPageId, type PageKey } from './config'
import { findChildPageByTitle } from './notion'

export type PageIds = Record<PageKey, string>

export class MissingPageError extends Error {
  title: string
  constructor(title: string) {
    super(`No page titled "${title}" under your Notion parent page. Open /setup and run "Create my Notion pages".`)
    this.name = 'MissingPageError'
    this.title = title
  }
}

// Cached for the life of the serverless instance: one Notion round-trip per
// cold start rather than three per message.
let cache: PageIds | null = null

export function clearPageCache(): void {
  cache = null
}

export async function resolvePages(): Promise<PageIds> {
  if (cache) return cache

  const parent = parentPageId()
  const entries = Object.entries(PAGE_TITLES) as [PageKey, string][]
  const resolved = {} as PageIds

  for (const [key, title] of entries) {
    const id = await findChildPageByTitle(parent, title)
    if (!id) throw new MissingPageError(title)
    resolved[key] = id
  }

  // Only cache a complete result, so a half-built workspace re-checks next time.
  cache = resolved
  return resolved
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, 26 tests.

> If the `vi.spyOn(notion, ...)` mocks do not take effect, it is because `pages.ts` captured the binding at import. Change the import in `pages.ts` to `import * as notion from './notion'` and call `notion.findChildPageByTitle(...)`, which keeps the spy seam working.

- [ ] **Step 5: Commit**

```bash
git add lib/inbox/pages.ts lib/inbox/pages.test.ts
git commit -m "feat: resolve Notion pages by title with a cold-start cache"
```

---

### Task 6: The agent

**Files:**
- Create: `lib/inbox/agent.ts`

**Interfaces:**
- Consumes: `TODO_SECTIONS`, `TODO_SECTION_HINTS`, `USER_TIMEZONE` from `config.ts`; `findSections`, `findByLabel`, `appendToDo`, `appendBullet`, `notionDeepLink`, `ensureSection`, `Section` from `notion.ts`; `resolvePages`, `PageIds` from `pages.ts`; `currentMonthLabel`, `currentYear` from `dates.ts`
- Produces:
  - `type InboxImage = { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }`
  - `type AgentResult = { reply: string }`
  - `runAgent(message: string, image?: InboxImage): Promise<AgentResult>`

Trimmed from the origin: the four calendar tools, the `calendars` half of `Ctx`, and the entire `pending` return path are gone. The two rot fixes from the spec land here.

- [ ] **Step 1: Implement `lib/inbox/agent.ts`**

```typescript
// The "brain": a small tool-use agent that files notes into Notion. It loops
// (call tool → read result → act) until it produces a reply.

import Anthropic from '@anthropic-ai/sdk'
import { TODO_SECTIONS, TODO_SECTION_HINTS, USER_TIMEZONE } from './config'
import {
  findSections,
  findByLabel,
  appendToDo,
  appendBullet,
  notionDeepLink,
  ensureSection,
  type Section,
} from './notion'
import { resolvePages, type PageIds } from './pages'
import { currentMonthLabel, currentYear } from './dates'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = process.env.INBOX_MODEL || 'claude-haiku-4-5-20251001'

export type AgentResult = { reply: string }

// A WhatsApp image handed to the agent for vision. media_type is constrained to
// what the Anthropic API accepts.
export type InboxImage = {
  data: string // base64, no data: prefix
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

type Ctx = { todoCandidates: Section[]; pages: PageIds }

type ToolOut = { text: string }

async function runTool(name: string, input: Record<string, unknown>, ctx: Ctx): Promise<ToolOut> {
  try {
    switch (name) {
      case 'add_todo': {
        const text = String(input.text || '').trim()
        if (!text) return { text: 'No text provided.' }
        const due = input.due ? String(input.due).trim() : undefined
        const target = findByLabel(ctx.todoCandidates, input.list as string) || ctx.todoCandidates[0]
        const b = await appendToDo(target?.id || ctx.pages.todo, text, due)
        const dated = due ? ` with a ${due} date chip` : ''
        return {
          text: `Added to-do${target ? ` to "${target.label}"` : ''}${dated}. Link: ${notionDeepLink(ctx.pages.todo, b?.id)}`,
        }
      }
      case 'add_learning':
      case 'add_musing': {
        const text = String(input.text || '').trim()
        if (!text) return { text: 'No text provided.' }
        const isLearning = name === 'add_learning'
        const pageId = isLearning ? ctx.pages.learning : ctx.pages.musing
        const noun = isLearning ? 'Learnings' : 'Musings'
        const month = currentMonthLabel(USER_TIMEZONE)
        // Create the month's toggle if this is the first note of the month.
        const sectionId = await ensureSection(pageId, month, 'toggle')
        const b = await appendBullet(sectionId, text)
        return {
          text: `Added under ${month} in ${noun}. Link: ${notionDeepLink(pageId, b?.id)}`,
        }
      }
      default:
        return { text: `Unknown tool ${name}` }
    }
  } catch (err) {
    console.error('inbox tool error', name, err)
    return { text: `Error running ${name}: ${(err as Error).message}` }
  }
}

export async function runAgent(message: string, image?: InboxImage): Promise<AgentResult> {
  const pages = await resolvePages()

  // Discover the live to-do sections, filtered to the configured allow-list.
  const discovered = await findSections(pages.todo)
  const todoCandidates = discovered.filter((s) =>
    TODO_SECTIONS.some((n) => n.toLowerCase() === s.label.toLowerCase()),
  )
  const todoLabels = todoCandidates.map((c) => c.label)
  const listHint = todoLabels
    .map((s) => {
      const h = TODO_SECTION_HINTS[s.toLowerCase()]
      return h ? `"${s}" (${h})` : `"${s}"`
    })
    .join(', ')

  const year = currentYear(USER_TIMEZONE)

  const tools: Anthropic.Tool[] = [
    {
      name: 'add_todo',
      description: 'Add a to-do / task to Notion.',
      input_schema: {
        type: 'object',
        properties: {
          list: todoLabels.length
            ? { type: 'string', enum: todoLabels, description: `Which list. Options: ${listHint}.` }
            : { type: 'string', description: 'Which list.' },
          text: { type: 'string', description: 'The task, lightly cleaned. Keep meaning and voice.' },
          due: {
            type: 'string',
            description:
              'Optional date to attach as an inline Notion date chip (like typing "@today"). Naive local format: YYYY-MM-DD for all-day, or YYYY-MM-DDTHH:MM:SS if the user gave a specific time. Resolve relative dates ("today", "tomorrow", "by Friday", "next week") against the current local time. Omit entirely when the task has no date.',
          },
        },
        required: ['text'],
      },
    },
    {
      name: 'add_learning',
      description: `Save an insight/lesson under the current month in the ${year} Learnings page.`,
      input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
    {
      name: 'add_musing',
      description: `Save a reflection/idea under the current month in the ${year} Musings page.`,
      input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
  ]

  const human = new Intl.DateTimeFormat('en-GB', {
    timeZone: USER_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  const system =
    'You are a personal assistant the user texts over WhatsApp. You file their quick notes into Notion.\n' +
    `Now: ${human} (${USER_TIMEZONE}).\n` +
    'Pick exactly one of: add_todo (something to do), add_learning (something they learned), add_musing (a reflection or idea). Lightly clean the text — fix dictation and punctuation only — but keep the meaning and their voice.\n' +
    'If a to-do names or implies a date ("today", "tomorrow", "by Friday", "next week", "on the 3rd"), pass it as add_todo\'s `due` so it shows as an inline date chip — a naive-local YYYY-MM-DD, or YYYY-MM-DDTHH:MM:SS only if they gave a specific time. Leave `due` off when there is no date. The chip displays the date; it does not by itself send a reminder.\n' +
    'If an image is attached (a screenshot, a whiteboard, a poster, a receipt), read it and file what it shows: an actionable task becomes a to-do, anything else becomes a learning or a musing. Echo back the key details you pulled out so a misread is easy to spot. If the image is blurry or you are unsure, say what you can see and ask before filing.\n' +
    'If a request is genuinely ambiguous, ask one short clarifying question instead of guessing.\n' +
    'Reply in one or two short, friendly lines, and always include the link the tool returns.'

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: image
        ? [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
            { type: 'text', text: message || 'Read this image and file it appropriately.' },
          ]
        : message,
    },
  ]
  const ctx: Ctx = { todoCandidates, pages }

  for (let step = 0; step < 5; step++) {
    const resp = await anthropic.messages.create({ model: MODEL, max_tokens: 1024, system, tools, messages })
    messages.push({ role: 'assistant', content: resp.content })

    const toolUses = resp.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
    if (toolUses.length === 0) {
      const text = resp.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
        .trim()
      return { reply: text || '✅ Done.' }
    }

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const r = await runTool(tu.name, (tu.input || {}) as Record<string, unknown>, ctx)
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: r.text })
    }
    messages.push({ role: 'user', content: results })
  }

  return { reply: '⚠️ That got complicated — could you rephrase?' }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify tests still pass**

Run: `npx vitest run`
Expected: PASS, 26 tests.

- [ ] **Step 4: Confirm no rot markers remain**

Run: `grep -rn "20[0-9][0-9]" lib/inbox/agent.ts`
Expected: no matches. A literal year in the agent is the bug this task exists to prevent.

- [ ] **Step 5: Commit**

```bash
git add lib/inbox/agent.ts
git commit -m "feat: notes-only agent with derived year and self-healing months"
```

---

### Task 7: The webhook

**Files:**
- Create: `app/api/whatsapp/route.ts`

**Interfaces:**
- Consumes: `verifySignature`, `isAllowedSender`, `sendText`, `fetchMedia` from `lib/inbox/whatsapp.ts`; `runAgent`, `InboxImage` from `lib/inbox/agent.ts`; `MissingPageError` from `lib/inbox/pages.ts`
- Produces: `GET` and `POST` handlers at `/api/whatsapp`

Trimmed from the origin: the audio branch, the pending/confirmation branch, and `applyPending`. Text and images stay — images need no service beyond the WhatsApp token and the Anthropic key.

- [ ] **Step 1: Implement `app/api/whatsapp/route.ts`**

```typescript
import { NextRequest, NextResponse, after } from 'next/server'
import { verifySignature, isAllowedSender, sendText, fetchMedia } from '@/lib/inbox/whatsapp'
import { runAgent, type InboxImage } from '@/lib/inbox/agent'
import { MissingPageError } from '@/lib/inbox/pages'

// Node runtime is required for the `crypto` HMAC check and `after()`.
export const runtime = 'nodejs'

// Map WhatsApp's reported mime type to one the Anthropic vision API accepts,
// defaulting to JPEG (what WhatsApp sends for photos and most screenshots).
function toImageMediaType(mime: string): InboxImage['mediaType'] {
  const m = mime.toLowerCase()
  if (m.includes('png')) return 'image/png'
  if (m.includes('webp')) return 'image/webp'
  if (m.includes('gif')) return 'image/gif'
  return 'image/jpeg'
}

// Webhook verification handshake (Meta calls this once when saving the URL).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  const raw = await request.text()

  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'))) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const value = payload?.entry?.[0]?.changes?.[0]?.value
  const message = value?.messages?.[0]

  // Ignore delivery/read status callbacks and message types we don't handle.
  if (!message || !['text', 'image'].includes(message.type)) {
    return NextResponse.json({ ok: true })
  }

  const from: string = message.from
  if (!isAllowedSender(from)) {
    return NextResponse.json({ ok: true })
  }

  const textBody: string = (message.text?.body ?? '').trim()
  // Images carry a media id, not text — we fetch it in `after()`.
  const imageId: string | undefined = message.type === 'image' ? message.image?.id : undefined
  // A photo can ship with a caption; treat it as the text.
  const caption: string = message.type === 'image' ? (message.image?.caption ?? '').trim() : ''

  if (!textBody && !imageId) {
    return NextResponse.json({ ok: true })
  }

  // Acknowledge immediately; do the work after responding so Meta won't retry.
  after(async () => {
    try {
      let text = textBody
      let image: InboxImage | undefined
      if (imageId) {
        try {
          const { bytes, mimeType } = await fetchMedia(imageId)
          image = { data: bytes.toString('base64'), mediaType: toImageMediaType(mimeType) }
        } catch (err) {
          console.error('image fetch failed:', err)
          await sendText(from, "⚠️ Couldn't open that image — mind resending it?")
          return
        }
        text = caption // may be empty; the agent reads the image regardless
      }

      const { reply } = await runAgent(text, image)
      await sendText(from, reply)
    } catch (err) {
      console.error('WhatsApp inbox error:', err)
      try {
        // Configuration problems get a reply that says what to fix, rather than
        // a generic shrug the user can do nothing with.
        if (err instanceof MissingPageError) {
          await sendText(from, `⚠️ I can't find your "${err.title}" page in Notion. Open /setup and run "Create my Notion pages".`)
        } else if (err instanceof Error && /Missing required environment variable/.test(err.message)) {
          await sendText(from, `⚠️ ${err.message}`)
        } else {
          await sendText(from, "⚠️ Couldn't handle that — something went wrong. Try again in a moment.")
        }
      } catch {}
    }
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify the app builds**

Run: `npm run build`
Expected: build succeeds and lists `/api/whatsapp` as a route.

- [ ] **Step 3: Verify the verification handshake by hand**

Run:
```bash
npm run dev &
sleep 5
WHATSAPP_VERIFY_TOKEN=test-token curl -s "http://localhost:3000/api/whatsapp?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=CHALLENGE_OK"
```
Expected: prints `CHALLENGE_OK`. (The env var must be in `.env.local` for the dev server to see it; set it there rather than inline if the inline form doesn't take.) Then kill the dev server.

- [ ] **Step 4: Verify an unsigned POST is rejected**

Run: `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/whatsapp -d '{}'`
Expected: `401`.

- [ ] **Step 5: Commit**

```bash
git add app/api/whatsapp/route.ts
git commit -m "feat: WhatsApp webhook with text and image handling"
```

---

### Task 8: Setup gate and credential checks

**Files:**
- Create: `lib/setup/gate.ts`, `lib/setup/checks.ts`
- Test: `lib/setup/gate.test.ts`

**Interfaces:**
- Consumes: `GRAPH_VERSION` from `lib/inbox/config.ts`; `notionUserName` from `lib/inbox/notion.ts`
- Produces:
  - `setupSecretOk(provided: string | null): boolean`
  - `type CheckResult = { ok: boolean; detail: string }`
  - `type EnvRow = { name: string; set: boolean; required: boolean }`
  - `envChecklist(): EnvRow[]`
  - `checkAnthropic(): Promise<CheckResult>`
  - `checkNotion(): Promise<CheckResult>`
  - `checkWhatsApp(): Promise<CheckResult>`

- [ ] **Step 1: Write the failing tests for the gate**

```typescript
// lib/setup/gate.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { setupSecretOk } from './gate'

describe('setupSecretOk', () => {
  afterEach(() => {
    delete process.env.SETUP_SECRET
  })

  it('accepts the correct secret', () => {
    process.env.SETUP_SECRET = 's3cret-value'
    expect(setupSecretOk('s3cret-value')).toBe(true)
  })

  it('rejects a wrong secret of the same length', () => {
    process.env.SETUP_SECRET = 's3cret-value'
    expect(setupSecretOk('s3cret-valuX')).toBe(false)
  })

  it('rejects a wrong secret of a different length without throwing', () => {
    process.env.SETUP_SECRET = 's3cret-value'
    expect(setupSecretOk('short')).toBe(false)
  })

  it('rejects a null key', () => {
    process.env.SETUP_SECRET = 's3cret-value'
    expect(setupSecretOk(null)).toBe(false)
  })

  // Unsetting SETUP_SECRET is the documented way to switch the wizard off for
  // good once setup is done, so it must deny everything — including an empty key.
  it('denies everything when SETUP_SECRET is unset', () => {
    expect(setupSecretOk('anything')).toBe(false)
    expect(setupSecretOk('')).toBe(false)
    expect(setupSecretOk(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/setup/gate.test.ts`
Expected: FAIL — cannot resolve `./gate`.

- [ ] **Step 3: Implement `lib/setup/gate.ts`**

```typescript
// The setup wizard sits on a public URL, so both the page and the API routes it
// calls are gated on a shared secret. Gating only the page would leave
// POST /api/setup/bootstrap open to anyone, able to create pages in the
// deployer's Notion workspace.
//
// Unsetting SETUP_SECRET denies everything, which is the documented way to
// retire the wizard once setup is finished.

import crypto from 'crypto'

export function setupSecretOk(provided: string | null): boolean {
  const secret = process.env.SETUP_SECRET
  if (!secret || !provided) return false

  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, 31 tests.

- [ ] **Step 5: Implement `lib/setup/checks.ts`**

```typescript
// Live credential validation for the setup wizard. Each check calls the real
// service, because "the variable is set" and "the credential works" are
// different questions and only the second one matters.
//
// No check ever returns a credential value — only whether it worked and what to
// do about it.

import { GRAPH_VERSION } from '@/lib/inbox/config'
import { notionUserName } from '@/lib/inbox/notion'

export type CheckResult = { ok: boolean; detail: string }
export type EnvRow = { name: string; set: boolean; required: boolean }

const REQUIRED = [
  'ANTHROPIC_API_KEY',
  'NOTION_TOKEN',
  'NOTION_PARENT_PAGE_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ALLOWED_SENDERS',
  'SETUP_SECRET',
]

const OPTIONAL = ['NOTION_TODO_SECTIONS', 'USER_TIMEZONE', 'INBOX_MODEL', 'WHATSAPP_GRAPH_VERSION']

export function envChecklist(): EnvRow[] {
  const isSet = (n: string) => Boolean(process.env[n] && process.env[n]!.trim())
  return [
    ...REQUIRED.map((name) => ({ name, set: isSet(name), required: true })),
    ...OPTIONAL.map((name) => ({ name, set: isSet(name), required: false })),
  ]
}

export async function checkAnthropic(): Promise<CheckResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, detail: 'ANTHROPIC_API_KEY is not set.' }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.INBOX_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    if (res.ok) return { ok: true, detail: 'Anthropic API key works.' }
    if (res.status === 401) return { ok: false, detail: 'Anthropic rejected the key. Check ANTHROPIC_API_KEY.' }
    if (res.status === 400) {
      const body = await res.text()
      if (body.includes('model')) {
        return { ok: false, detail: 'The key works but INBOX_MODEL is not a valid model id. Unset it to use the default.' }
      }
    }
    return { ok: false, detail: `Anthropic returned ${res.status}.` }
  } catch (err) {
    return { ok: false, detail: `Could not reach Anthropic: ${(err as Error).message}` }
  }
}

export async function checkNotion(): Promise<CheckResult> {
  if (!process.env.NOTION_TOKEN) return { ok: false, detail: 'NOTION_TOKEN is not set.' }
  const parent = process.env.NOTION_PARENT_PAGE_ID
  if (!parent) return { ok: false, detail: 'NOTION_PARENT_PAGE_ID is not set.' }

  let name: string
  try {
    name = await notionUserName()
  } catch (err) {
    return { ok: false, detail: `Notion rejected the token: ${(err as Error).message}` }
  }

  // The token being valid says nothing about the integration being able to see
  // the parent page — forgetting to share it is the most common Notion mistake.
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${parent}`, {
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
      },
    })
    if (res.status === 404) {
      return {
        ok: false,
        detail:
          `Connected as "${name}", but it cannot see that page. In Notion open your parent page → ••• → Connections → add this integration. ` +
          'Also check NOTION_PARENT_PAGE_ID is the 32-character id from the page URL.',
      }
    }
    if (!res.ok) return { ok: false, detail: `Notion returned ${res.status} for the parent page.` }
    return { ok: true, detail: `Connected as "${name}" and your parent page is shared with it.` }
  } catch (err) {
    return { ok: false, detail: `Could not reach Notion: ${(err as Error).message}` }
  }
}

export async function checkWhatsApp(): Promise<CheckResult> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token) return { ok: false, detail: 'WHATSAPP_TOKEN is not set.' }
  if (!phoneId) return { ok: false, detail: 'WHATSAPP_PHONE_NUMBER_ID is not set.' }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.text()

    if (res.ok) {
      let display = ''
      try {
        display = (JSON.parse(body).display_phone_number as string) || ''
      } catch {}
      return { ok: true, detail: `Token works${display ? ` for ${display}` : ''}.` }
    }

    // Meta uses OAuth error code 190 for invalid *and* expired tokens. The
    // expired case is the one that matters: the temporary token on the API Setup
    // page lasts 24 hours, so this is the single most likely reason a working
    // assistant goes silent the next day.
    let code: number | undefined
    let message = ''
    try {
      const err = JSON.parse(body).error || {}
      code = err.code
      message = String(err.message || '')
    } catch {}

    if (code === 190 || /expired/i.test(message)) {
      return {
        ok: false,
        detail:
          'Your WhatsApp token has expired or been revoked. The temporary token on the API Setup page only lasts 24 hours — ' +
          'create a System User in Business Settings, give it whatsapp_business_messaging, generate a non-expiring token, and put that in WHATSAPP_TOKEN.',
      }
    }
    if (res.status === 404) {
      return { ok: false, detail: 'That phone number id does not exist. Copy it from WhatsApp → API Setup.' }
    }
    return { ok: false, detail: `WhatsApp returned ${res.status}${message ? `: ${message}` : ''}.` }
  } catch (err) {
    return { ok: false, detail: `Could not reach Meta: ${(err as Error).message}` }
  }
}
```

- [ ] **Step 6: Verify it type-checks and tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; PASS, 31 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/setup/gate.ts lib/setup/checks.ts lib/setup/gate.test.ts
git commit -m "feat: setup gate and live credential checks"
```

---

### Task 9: Setup API routes

**Files:**
- Create: `app/api/setup/check/route.ts`, `app/api/setup/bootstrap/route.ts`

**Interfaces:**
- Consumes: `setupSecretOk` from `lib/setup/gate.ts`; `checkAnthropic`, `checkNotion`, `checkWhatsApp` from `lib/setup/checks.ts`; `PAGE_TITLES`, `TODO_SECTIONS`, `USER_TIMEZONE`, `parentPageId` from `lib/inbox/config.ts`; `findChildPageByTitle`, `createPage`, `ensureSection` from `lib/inbox/notion.ts`; `clearPageCache` from `lib/inbox/pages.ts`; `currentMonthLabel` from `lib/inbox/dates.ts`
- Produces:
  - `POST /api/setup/check` → `{ anthropic: CheckResult, notion: CheckResult, whatsapp: CheckResult }`
  - `POST /api/setup/bootstrap` → `{ created: string[], existing: string[], sections: string[], month: string }`

- [ ] **Step 1: Implement `app/api/setup/check/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { setupSecretOk } from '@/lib/setup/gate'
import { checkAnthropic, checkNotion, checkWhatsApp } from '@/lib/setup/checks'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  // The gate lives here, not only on the page — this route is publicly routable.
  if (!setupSecretOk(request.nextUrl.searchParams.get('key'))) {
    return new NextResponse('Not found', { status: 404 })
  }

  const [anthropic, notion, whatsapp] = await Promise.all([
    checkAnthropic(),
    checkNotion(),
    checkWhatsApp(),
  ])

  return NextResponse.json({ anthropic, notion, whatsapp })
}
```

- [ ] **Step 2: Implement `app/api/setup/bootstrap/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { setupSecretOk } from '@/lib/setup/gate'
import { PAGE_TITLES, TODO_SECTIONS, USER_TIMEZONE, parentPageId } from '@/lib/inbox/config'
import { findChildPageByTitle, createPage, ensureSection } from '@/lib/inbox/notion'
import { clearPageCache } from '@/lib/inbox/pages'
import { currentMonthLabel } from '@/lib/inbox/dates'

export const runtime = 'nodejs'

const ICONS: Record<string, string> = { Todo: '☑️', Learnings: '🧠', Musings: '🍄' }

export async function POST(request: NextRequest) {
  if (!setupSecretOk(request.nextUrl.searchParams.get('key'))) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const parent = parentPageId()
    const created: string[] = []
    const existing: string[] = []

    // Idempotent: look before creating, so a double click cannot duplicate.
    const ids: Record<string, string> = {}
    for (const title of Object.values(PAGE_TITLES)) {
      const found = await findChildPageByTitle(parent, title)
      if (found) {
        ids[title] = found
        existing.push(title)
      } else {
        ids[title] = await createPage(parent, title, ICONS[title])
        created.push(title)
      }
    }

    // Todo gets a heading per configured sub-list.
    for (const section of TODO_SECTIONS) {
      await ensureSection(ids[PAGE_TITLES.todo], section, 'heading_3')
    }

    // Learnings and Musings get this month's toggle. Later months are created on
    // demand by the agent, so there is nothing to pre-build.
    const month = currentMonthLabel(USER_TIMEZONE)
    await ensureSection(ids[PAGE_TITLES.learning], month, 'toggle')
    await ensureSection(ids[PAGE_TITLES.musing], month, 'toggle')

    // The runtime cache may hold a failed lookup from before the pages existed.
    clearPageCache()

    return NextResponse.json({ created, existing, sections: TODO_SECTIONS, month })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds, listing `/api/setup/check` and `/api/setup/bootstrap`.

- [ ] **Step 4: Verify both routes 404 without the key**

Run:
```bash
npm run dev &
sleep 5
curl -s -o /dev/null -w 'check=%{http_code} ' -X POST http://localhost:3000/api/setup/check
curl -s -o /dev/null -w 'bootstrap=%{http_code}\n' -X POST http://localhost:3000/api/setup/bootstrap
```
Expected: `check=404 bootstrap=404` — with `SETUP_SECRET` unset, everything is denied. Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add app/api/setup
git commit -m "feat: gated setup check and Notion bootstrap routes"
```

---

### Task 10: The wizard page

**Files:**
- Create: `app/setup/page.tsx`, `app/setup/actions-client.tsx`

**Interfaces:**
- Consumes: `setupSecretOk` from `lib/setup/gate.ts`; `envChecklist` from `lib/setup/checks.ts`
- Produces: the `/setup` page

The page is a server component (it reads `process.env` for the checklist and calls the gate). The buttons live in a client component that POSTs to the routes from Task 9.

- [ ] **Step 1: Implement `app/setup/actions-client.tsx`**

```tsx
'use client'

import { useState } from 'react'

type CheckResult = { ok: boolean; detail: string }
type Checks = { anthropic: CheckResult; notion: CheckResult; whatsapp: CheckResult }

const box: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  padding: '1rem',
  margin: '1rem 0',
  background: '#fff',
}

const button: React.CSSProperties = {
  padding: '0.6rem 1rem',
  borderRadius: 6,
  border: '1px solid #111',
  background: '#111',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.95rem',
}

function Row({ label, result }: { label: string; result: CheckResult | undefined }) {
  if (!result) return null
  return (
    <p style={{ margin: '0.5rem 0' }}>
      <strong>{result.ok ? '✅' : '❌'} {label}</strong>
      <br />
      <span style={{ color: '#555' }}>{result.detail}</span>
    </p>
  )
}

export function SetupActions({ setupKey }: { setupKey: string }) {
  const [checks, setChecks] = useState<Checks | null>(null)
  const [checking, setChecking] = useState(false)
  const [boot, setBoot] = useState<string | null>(null)
  const [booting, setBooting] = useState(false)

  const qs = `?key=${encodeURIComponent(setupKey)}`

  async function runChecks() {
    setChecking(true)
    setChecks(null)
    try {
      const res = await fetch(`/api/setup/check${qs}`, { method: 'POST' })
      setChecks(await res.json())
    } catch (err) {
      setBoot(`Could not run checks: ${(err as Error).message}`)
    } finally {
      setChecking(false)
    }
  }

  async function runBootstrap() {
    setBooting(true)
    setBoot(null)
    try {
      const res = await fetch(`/api/setup/bootstrap${qs}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setBoot(`❌ ${data.error}`)
      } else {
        const made = data.created.length ? `Created: ${data.created.join(', ')}. ` : ''
        const had = data.existing.length ? `Already there: ${data.existing.join(', ')}. ` : ''
        setBoot(`✅ ${made}${had}To-do lists: ${data.sections.join(', ')}. Month toggle: ${data.month}.`)
      }
    } catch (err) {
      setBoot(`❌ ${(err as Error).message}`)
    } finally {
      setBooting(false)
    }
  }

  return (
    <>
      <div style={box}>
        <h2 style={{ marginTop: 0 }}>2. Do the credentials actually work?</h2>
        <p style={{ color: '#555' }}>
          Set is not the same as working. This calls each service for real.
        </p>
        <button style={button} onClick={runChecks} disabled={checking}>
          {checking ? 'Checking…' : 'Test my credentials'}
        </button>
        {checks && (
          <div style={{ marginTop: '1rem' }}>
            <Row label="Anthropic" result={checks.anthropic} />
            <Row label="Notion" result={checks.notion} />
            <Row label="WhatsApp" result={checks.whatsapp} />
          </div>
        )}
      </div>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>3. Build the Notion pages</h2>
        <p style={{ color: '#555' }}>
          Creates Todo, Learnings and Musings inside your parent page, with your
          to-do lists and this month&apos;s toggle. Safe to run twice — it checks
          before it creates.
        </p>
        <button style={button} onClick={runBootstrap} disabled={booting}>
          {booting ? 'Creating…' : 'Create my Notion pages'}
        </button>
        {boot && <p style={{ marginTop: '1rem' }}>{boot}</p>}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Implement `app/setup/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { setupSecretOk } from '@/lib/setup/gate'
import { envChecklist } from '@/lib/setup/checks'
import { SetupActions } from './actions-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const box: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  padding: '1rem',
  margin: '1rem 0',
  background: '#fff',
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const { key } = await searchParams
  // A wrong or absent key is indistinguishable from a route that doesn't exist.
  if (!setupSecretOk(key ?? null)) notFound()

  const rows = envChecklist()
  const missingRequired = rows.filter((r) => r.required && !r.set)

  const h = await headers()
  const host = h.get('host') || 'your-app.vercel.app'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const webhookUrl = `${proto}://${host}/api/whatsapp`

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem', lineHeight: 1.6 }}>
      <h1>Setup</h1>
      <p style={{ color: '#555' }}>
        Work down the page. When everything passes, message your WhatsApp test number.
      </p>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>1. Environment variables</h2>
        {missingRequired.length === 0 ? (
          <p>✅ Every required variable is set.</p>
        ) : (
          <p>❌ Still missing: {missingRequired.map((r) => r.name).join(', ')}</p>
        )}
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td style={{ padding: '0.25rem 0' }}>
                  <code>{r.name}</code>
                  {!r.required && <span style={{ color: '#999' }}> (optional)</span>}
                </td>
                <td style={{ padding: '0.25rem 0', textAlign: 'right' }}>
                  {r.set ? '✅ set' : r.required ? '❌ missing' : '— using default'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: '#999', fontSize: '0.85rem' }}>
          Values are never shown here — only whether something is set.
        </p>
      </div>

      <SetupActions setupKey={key!} />

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>4. Point Meta at this app</h2>
        <p>
          In your Meta app under <em>WhatsApp → Configuration → Webhook</em>, use:
        </p>
        <p>
          <strong>Callback URL</strong>
          <br />
          <code>{webhookUrl}</code>
        </p>
        <p>
          <strong>Verify token</strong>
          <br />
          whatever you set as <code>WHATSAPP_VERIFY_TOKEN</code>
        </p>
        <p>Then subscribe to the <code>messages</code> field. Nothing arrives until you do.</p>
      </div>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>5. When you&apos;re done</h2>
        <p>
          Delete <code>SETUP_SECRET</code> in your Vercel environment variables and redeploy.
          This page and its API routes will return 404 to everyone, including you.
          Set it again whenever you need to come back.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds, listing `/setup`.

- [ ] **Step 4: Verify the page 404s without a valid key**

Run:
```bash
npm run dev &
sleep 5
curl -s -o /dev/null -w 'nokey=%{http_code} ' http://localhost:3000/setup
curl -s -o /dev/null -w 'wrongkey=%{http_code}\n' 'http://localhost:3000/setup?key=nope'
```
Expected: `nokey=404 wrongkey=404`.

- [ ] **Step 5: Verify the page renders with a valid key**

Add `SETUP_SECRET=local-test-secret` to `.env.local`, restart the dev server, then run:
```bash
curl -s 'http://localhost:3000/setup?key=local-test-secret' | grep -c 'Environment variables'
```
Expected: `1`. Kill the dev server and remove `.env.local` if it holds nothing else.

- [ ] **Step 6: Commit**

```bash
git add app/setup
git commit -m "feat: gated setup wizard with checks, bootstrap and webhook helper"
```

---

### Task 11: README and .env.example

**Files:**
- Create: `README.md`, `.env.example`

**Interfaces:**
- Consumes: everything above
- Produces: the documentation a stranger follows

The three gotchas below are load-bearing. Each one is a failure the original author hit, and each looks like "the code is broken" to someone who does not know better.

- [ ] **Step 1: Create `.env.example`**

```bash
# ── Required ────────────────────────────────────────────────────────────────

# Anthropic API key — powers the assistant. https://console.anthropic.com
ANTHROPIC_API_KEY=

# Notion internal integration secret. https://www.notion.so/profile/integrations
NOTION_TOKEN=
# The ONE Notion page you shared with that integration. The assistant creates
# Todo / Learnings / Musings inside it. This is the 32-character id in the page URL.
NOTION_PARENT_PAGE_ID=

# WhatsApp Cloud API, from your Meta app.
# Any random string you invent; must match what you type into Meta's webhook form.
WHATSAPP_VERIFY_TOKEN=
# App Settings → Basic → App Secret. Used to verify Meta actually sent the request.
WHATSAPP_APP_SECRET=
# NOT the temporary token — that dies in 24 hours. Use a System User token.
WHATSAPP_TOKEN=
# WhatsApp → API Setup → Phone number ID.
WHATSAPP_PHONE_NUMBER_ID=
# Your own number, digits including country code, e.g. 447700900123.
# Comma-separate for more than one. Anyone not listed is ignored.
WHATSAPP_ALLOWED_SENDERS=

# Any random string. Gates /setup. Delete it once you're done to switch the
# wizard off permanently.
SETUP_SECRET=

# ── Optional ────────────────────────────────────────────────────────────────

# Your to-do sub-lists. Default: personal,work,someday
NOTION_TODO_SECTIONS=
# IANA timezone for date chips and month routing. Default: Europe/London
USER_TIMEZONE=
# Default: claude-haiku-4-5-20251001
INBOX_MODEL=
# Default: v21.0
WHATSAPP_GRAPH_VERSION=
```

- [ ] **Step 2: Create `README.md`**

Write the file with these sections, in this order. The ordering of section 6 is not cosmetic — Meta calls the webhook during verification, so the app has to be live first.

````markdown
# WhatsApp Personal Assistant

Text yourself a note on WhatsApp. An LLM decides whether it's a **to-do**, a
**learning**, or a **musing**, files it in the right Notion page, and replies with
a link to exactly where it landed. Send a photo and it reads that too.

```
You (WhatsApp) ──▶ WhatsApp Cloud API ──▶ POST /api/whatsapp  (this app, on Vercel)
                                                  │
                                          Claude reads the message
                                          → to-do | learning | musing
                                                  │
                                   ┌──────────────┼──────────────┐
                                   ▼              ▼              ▼
                                ☑️ Todo      🧠 Learnings    🍄 Musings
                              (your lists)   (by month)      (by month)
                                   │
                                   ▼
                        ◀── "✅ To-do → *work*  <link>"
```

## What you need

Three accounts, about 45 minutes, and essentially no running cost: Vercel Hobby is
free, Notion is free, and Claude Haiku on short messages runs to fractions of a
penny per message.

- A [Vercel](https://vercel.com) account
- A [Notion](https://notion.so) account
- An [Anthropic API key](https://console.anthropic.com)
- A [Meta developer](https://developers.facebook.com) account

## 1. Deploy

[Deploy to Vercel button pointing at this repo.] Leave the environment variables
blank for now — you'll fill them in as you go. The deploy will succeed either way.

## 2. Notion

1. Go to <https://www.notion.so/profile/integrations> → **New integration** (internal).
   Give it **Read content** and **Insert content**.
2. Copy the **Internal Integration Secret** → `NOTION_TOKEN`.
3. In Notion, make **one** page to hold everything (call it *Assistant*, or anything).
4. On that page: **•••** → **Connections** → add your integration. **This step is the
   one everyone forgets**, and without it nothing can be created.
5. Copy the 32-character id out of the page URL → `NOTION_PARENT_PAGE_ID`.

## 3. Anthropic

Create a key at <https://console.anthropic.com> → `ANTHROPIC_API_KEY`.

## 4. Set the variables and redeploy

In Vercel → Settings → Environment Variables, add everything from `.env.example`
that you have so far, plus a `SETUP_SECRET` you invent. Redeploy.

## 5. Run the setup wizard

Open `https://YOUR-APP.vercel.app/setup?key=YOUR_SETUP_SECRET`.

Work down the page: it shows which variables are missing, tests that your
credentials really work, and builds your Notion pages for you.

## 6. WhatsApp — do this after deploying, not before

**Order matters.** Meta verifies the webhook by calling your app, so the app has to
be live with `WHATSAPP_VERIFY_TOKEN` already set before step 6 will work.

1. Create an app at <https://developers.facebook.com/apps> → type **Business**.
2. Add the **WhatsApp** product. Meta gives you a free **test number**.

   > **Do not register your own phone number.** A number attached to the Cloud API
   > can no longer be used in the normal WhatsApp app. Use Meta's test number and
   > message *it* from your personal WhatsApp.

3. Under **WhatsApp → API Setup**: copy the **Phone number ID** →
   `WHATSAPP_PHONE_NUMBER_ID`, and add your own number as an allowed recipient
   (you'll get a code to confirm). The test number can message up to 5 verified
   recipients, which is plenty for personal use.
4. **App Settings → Basic → App Secret** → `WHATSAPP_APP_SECRET`.
5. Create the access token → `WHATSAPP_TOKEN`.

   > **The temporary token on the API Setup page expires in 24 hours.** If you use
   > it, your assistant will work today and go silent tomorrow, and it will look
   > like the code broke. Instead: **Business Settings → Users → System Users** →
   > create one → give it `whatsapp_business_messaging` → generate a token with no
   > expiry.

6. Set `WHATSAPP_ALLOWED_SENDERS` to your own number (digits, with country code).
   Anyone not on this list is silently ignored. An empty list blocks everyone.
7. Redeploy so the new variables take effect.
8. **WhatsApp → Configuration → Webhook** → Callback URL
   `https://YOUR-APP.vercel.app/api/whatsapp`, verify token = your
   `WHATSAPP_VERIFY_TOKEN`. Click **Verify and save**.
9. Under **Webhook fields**, subscribe to **`messages`**. Nothing arrives until you do.

## 7. Try it

Message the test number from your phone:

- *"remind me to email the plumber on Friday"* → a checkbox with a date chip
- *"learned that defaults should change as users gain trust"* → a bullet under this month in Learnings
- *"what if onboarding had a voice-first mode"* → a bullet under this month in Musings

You should get a reply with a link within a few seconds.

## 8. Lock the wizard

Delete `SETUP_SECRET` in Vercel and redeploy. `/setup` and its API routes now 404
for everyone. Put it back whenever you need to return.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Webhook won't verify | App isn't deployed yet, `WHATSAPP_VERIFY_TOKEN` doesn't match, or you used a preview URL instead of the production one |
| Worked yesterday, silent today | The 24-hour temporary token expired. Use a System User token |
| No reply at all | Your number isn't in `WHATSAPP_ALLOWED_SENDERS` (digits only), or you didn't subscribe to `messages` |
| "I can't find your Todo page" | Run **Create my Notion pages** in `/setup`, or you renamed a page — the titles must stay Todo / Learnings / Musings |
| Notion 404 in `/setup` | The parent page isn't shared with the integration (••• → Connections) |
| Goes to the wrong to-do list | `NOTION_TODO_SECTIONS` must match the headings on your Todo page |

## Customising

- **Your own to-do lists:** set `NOTION_TODO_SECTIONS` (e.g. `home,studio,later`),
  then re-run **Create my Notion pages** in `/setup` to add the headings.
- **Your timezone:** set `USER_TIMEZONE` to your IANA zone. It decides date chips
  and which month a note is filed under.
- **A smarter model:** set `INBOX_MODEL` to a Sonnet model for trickier date parsing.

## Security

- Every request is HMAC-verified against `WHATSAPP_APP_SECRET`; bad signatures get 401.
- Only `WHATSAPP_ALLOWED_SENDERS` can write, and an empty list blocks everyone.
- `/setup` and its routes 404 without `SETUP_SECRET`, and never display a credential.
- Your Notion token only reaches the pages you explicitly shared.

## Licence

MIT.
````

- [ ] **Step 3: Verify `.env.example` and the checklist agree**

Run:
```bash
grep -oE '^[A-Z_]+=' .env.example | tr -d '=' | sort > /tmp/env-example.txt
grep -oE "'[A-Z_]+'" lib/setup/checks.ts | tr -d "'" | sort -u > /tmp/env-code.txt
diff /tmp/env-example.txt /tmp/env-code.txt
```
Expected: no differences. A variable documented but not checked (or checked but not documented) is exactly the gap that wastes an afternoon.

- [ ] **Step 4: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: no type errors; PASS, 31 tests; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example
git commit -m "docs: setup guide and environment variable reference"
```

---

## Self-review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Extract `lib/inbox`, drop calendar/voice/Supabase | 3, 4, 6, 7 |
| Four runtime dependencies | 1 |
| Remove hardcoded page IDs | 2 |
| Generic default to-do sections | 2 |
| `PAGE_TITLES` shared by bootstrap and runtime | 2, 5, 9 |
| Derive the year from the clock | 2, 6 (verified by grep in Task 6 Step 4) |
| Self-healing month toggles (`ensureSection`) | 4, 6 |
| Resolve pages by title, cached | 5 |
| Keep text and images, drop audio | 7 |
| Gate on API routes, not only the page | 8, 9, 10 |
| 404 when secret is wrong or unset | 8, 9, 10 |
| Never render credential values | 8, 10 |
| Idempotent bootstrap | 9 |
| Webhook helper showing the callback URL | 10 |
| Tests for `verifySignature` and `isAllowedSender` | 3 |
| Tests for month/year derivation | 2 |
| Vitest as the only test dep | 1 |
| README with the three gotchas in the right order | 11 |
| Lazy required-env reads | 2 (enforced by `requireEnv`/`parentPageId` being functions) |

No gaps.

**Placeholder scan:** none. Every code step carries the actual code; the only prose-only step is the MIT licence text (Task 1 Step 4) and the README body (Task 11 Step 2), which is given in full.

**Type consistency:** `PageIds` is `Record<PageKey, string>` where `PageKey = keyof typeof PAGE_TITLES` — `pages.ts` (Task 5) and `agent.ts` (Task 6) both use `ctx.pages.todo` / `.learning` / `.musing`, matching the `PAGE_TITLES` keys. `ensureSection(pageId, label, type)` has the same signature at all three call sites (Task 6 agent, Task 9 bootstrap ×3). `CheckResult` is identical in `checks.ts` (Task 8) and `actions-client.tsx` (Task 10). `createPage` returns `string` (the id), which is what bootstrap assigns into `ids[title]`.

**Known follow-ups, deliberately out of scope:** no idempotency on Meta message ids (a redelivery would file twice), and no rate limiting on the setup routes beyond the secret.
