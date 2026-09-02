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
