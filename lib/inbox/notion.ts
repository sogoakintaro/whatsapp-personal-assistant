// Minimal Notion REST client (no extra dependency) for reading page structure,
// appending blocks, and creating the pages this assistant files into.
// Auth uses an internal integration token in NOTION_TOKEN.

import { NOTION_VERSION, NOTION_APPEND_VERSION, USER_TIMEZONE } from './config'

const NOTION_API = 'https://api.notion.com/v1'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

function extractNotionId(input: string): string {
  const value = input.trim()
  const match = value.match(/[0-9a-fA-F]{32}/)
  if (!match) throw new Error(`Invalid Notion page ID or URL: ${input}`)
  return match[0]
}

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
   const cleanBlockId = extractNotionId(blockId)
const data = await notion(`/blocks/${cleanBlockId}/children?${qs.toString()}`)
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
// YYYY-MM-DDTHH:MM:SS (with a time). When a time is present we tag the user's
// timezone so Notion renders it correctly. Note: the public API can attach the
// chip but cannot arm the reminder/alert — that stays a manual tap in Notion.
function dateMention(date: string): Json {
  const hasTime = date.length > 10
  const dateObj: Json = { start: date, end: null }
  if (hasTime) dateObj.time_zone = USER_TIMEZONE
  return { type: 'mention', mention: { type: 'date', date: dateObj } }
}

// Rich text for a to-do, optionally followed by an inline date chip.
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
