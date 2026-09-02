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
