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
        <p>
          Then subscribe to the <code>messages</code> field. Nothing arrives until you do.
        </p>
      </div>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>5. When you&apos;re done</h2>
        <p>
          Delete <code>SETUP_SECRET</code> in your Vercel environment variables and redeploy. This
          page and its API routes will return 404 to everyone, including you. Set it again whenever
          you need to come back.
        </p>
      </div>
    </main>
  )
}
