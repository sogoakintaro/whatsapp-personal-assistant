import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { setupSecretOk } from '@/lib/setup/gate'
import { envChecklist } from '@/lib/setup/checks'
import { SetupActions } from './actions-client'
import { VAR_HELP, META_STEPS, TRY_IT } from './guidance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const box: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  padding: '1.25rem',
  margin: '1rem 0',
  background: '#fff',
}

const warn: React.CSSProperties = {
  borderLeft: '3px solid #d97706',
  background: '#fffbeb',
  padding: '0.6rem 0.9rem',
  margin: '0.75rem 0',
  fontSize: '0.9rem',
}

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  background: '#f4f4f5',
  padding: '0.5rem 0.7rem',
  borderRadius: 5,
  fontSize: '0.85rem',
  wordBreak: 'break-all',
  display: 'block',
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
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem', lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Set up your assistant</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Everything you need is on this page — you shouldn&apos;t need the README from here on.
        Work top to bottom. Expect about 45 minutes, most of it in Meta&apos;s dashboard.
      </p>

      {/* ── 1. Environment variables ─────────────────────────────────────── */}
      <div style={box}>
        <h2 style={{ marginTop: 0 }}>1. Your settings</h2>
        {missingRequired.length === 0 ? (
          <p>✅ Every required setting is filled in.</p>
        ) : (
          <p>
            <strong>{missingRequired.length} still missing.</strong> Add each one in Vercel under{' '}
            <em>Settings → Environment Variables</em> (set them for <em>Production</em>), then{' '}
            <em>Deployments → ⋯ → Redeploy</em> and reload this page.
          </p>
        )}

        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
          <tbody>
            {rows.map((r) => {
              const help = VAR_HELP[r.name]
              return (
                <tr key={r.name} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '0.5rem 0', verticalAlign: 'top' }}>
                    <code style={{ fontSize: '0.85rem' }}>{r.name}</code>
                    {!r.required && <span style={{ color: '#999' }}> (optional)</span>}
                    {help && !r.set && r.required && (
                      <div style={{ color: '#555', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                        {help.what}
                        <br />
                        <strong>Where to get it:</strong> {help.where}
                        {help.link && (
                          <>
                            {' '}
                            <a href={help.link.href} target="_blank" rel="noreferrer">
                              {help.link.label} ↗
                            </a>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                  <td
                    style={{
                      padding: '0.5rem 0',
                      textAlign: 'right',
                      verticalAlign: 'top',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.set ? '✅ set' : r.required ? '❌ missing' : '— default'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p style={{ color: '#999', fontSize: '0.85rem', marginBottom: 0 }}>
          Values are never shown here — only whether something is set.
        </p>
      </div>

      {/* ── 2 & 3. Live checks and Notion bootstrap (client) ─────────────── */}
      <SetupActions setupKey={key!} />

      {/* ── 4. WhatsApp ──────────────────────────────────────────────────── */}
      <div style={box}>
        <h2 style={{ marginTop: 0 }}>4. Connect WhatsApp</h2>
        <p style={{ color: '#555' }}>
          The longest part, and the only one nobody can automate for you. Do these in order — step 8
          only works because this app is already deployed.
        </p>

        <ol style={{ paddingLeft: '1.2rem' }}>
          {META_STEPS.map((s) => (
            <li key={s.title} style={{ marginBottom: '0.9rem' }}>
              <strong>{s.title}</strong>
              <br />
              <span style={{ color: '#444' }}>{s.body}</span>
              {s.warn && (
                <div style={warn}>
                  <strong>⚠️ {s.warn}</strong>
                </div>
              )}
            </li>
          ))}
        </ol>

        <p style={{ marginBottom: '0.3rem' }}>
          <strong>Callback URL</strong> — paste into Meta at step 8:
        </p>
        <code style={mono}>{webhookUrl}</code>
        <p style={{ marginTop: '0.9rem', marginBottom: '0.3rem' }}>
          <strong>Verify token</strong> — the value you set as <code>WHATSAPP_VERIFY_TOKEN</code>.
          Meta must receive exactly the same string.
        </p>
      </div>

      {/* ── 5. Try it ────────────────────────────────────────────────────── */}
      <div style={box}>
        <h2 style={{ marginTop: 0 }}>5. Send it a message</h2>
        <p style={{ color: '#555' }}>
          From your own phone, WhatsApp the test number Meta gave you. You should get a reply with a
          link within a few seconds.
        </p>
        <ul style={{ paddingLeft: '1.2rem' }}>
          {TRY_IT.map((t) => (
            <li key={t.say} style={{ marginBottom: '0.5rem' }}>
              <em>&ldquo;{t.say}&rdquo;</em>
              <br />
              <span style={{ color: '#666', fontSize: '0.9rem' }}>→ {t.gets}</span>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: 0 }}>
          You can also send a photo — a whiteboard, a poster, a receipt — and it will read it and
          file what it finds.
        </p>
      </div>

      {/* ── 6. Troubleshooting ───────────────────────────────────────────── */}
      <div style={box}>
        <h2 style={{ marginTop: 0 }}>If something isn&apos;t working</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
          <tbody>
            {[
              ['No reply at all', 'You skipped step 9 (subscribe to "messages"), or your number is not in WHATSAPP_ALLOWED_SENDERS — digits only, with country code.'],
              ['It worked yesterday, silent today', 'The 24-hour temporary token expired. Go back to step 6 and make a System User token with no expiry.'],
              ['Meta won’t verify the webhook', 'WHATSAPP_VERIFY_TOKEN must match what you typed into Meta exactly, and you must have redeployed after setting it.'],
              ['"I can’t find your Todo page"', 'Run "Create my Notion pages" above. If you renamed a page in Notion, rename it back — the titles must stay Todo, Learnings and Musings.'],
              ['Notion check fails with 404', 'The parent page is not shared with your integration: open the page → ••• → Connections → add it.'],
              ['A change had no effect', 'You almost certainly did not redeploy. Deployments → ⋯ → Redeploy.'],
            ].map(([symptom, cause]) => (
              <tr key={symptom} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '0.5rem 0.75rem 0.5rem 0', verticalAlign: 'top', width: '38%' }}>
                  <strong>{symptom}</strong>
                </td>
                <td style={{ padding: '0.5rem 0', color: '#444' }}>{cause}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 7. Lock up ───────────────────────────────────────────────────── */}
      <div style={box}>
        <h2 style={{ marginTop: 0 }}>6. When everything works, close this door</h2>
        <p>
          This page is on the public internet. The key in the address bar is the only thing keeping
          strangers out of it, so treat that URL like a password.
        </p>
        <p style={{ marginBottom: 0 }}>
          When you&apos;re finished, delete <code>SETUP_SECRET</code> in Vercel and redeploy. This
          page and everything behind it will then return 404 to everyone, including you. Put the
          variable back whenever you need to return.
        </p>
      </div>
    </main>
  )
}
