// Resolves the three Notion pages this assistant writes into, by title, under
// the one page the user shared with the integration.
//
// Why by title and not by id: the pages don't exist until /setup has run on the
// deployed app. Configuring their ids would mean deploy → setup → paste ids →
// redeploy. Resolving by title means the environment is set once and never
// touched again.

import { PAGE_TITLES, parentPageId, type PageKey } from './config'
// Namespace import so tests can spy on the lookup.
import * as notion from './notion'

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
    const id = await notion.findChildPageByTitle(parent, title)
    if (!id) throw new MissingPageError(title)
    resolved[key] = id
  }

  // Only cache a complete result, so a half-built workspace re-checks next time.
  cache = resolved
  return resolved
}
