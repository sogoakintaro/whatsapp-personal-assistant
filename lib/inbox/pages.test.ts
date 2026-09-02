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
