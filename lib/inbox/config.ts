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
