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
