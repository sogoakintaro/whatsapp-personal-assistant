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

You need this running on the internet before anything else works, because Meta
verifies the webhook by calling your app. So deploy first, with no configuration at
all — the first build succeeds with every environment variable blank.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsakkyb%2Fwhatsapp-personal-assistant)

That button copies this repo into your own GitHub account and deploys it. You'll be
asked to:

1. **Sign in to Vercel** — use "Continue with GitHub", it's the least friction.
2. **Name the repository** — anything; `whatsapp-assistant` is fine.
3. **Skip the environment variables.** Vercel offers to collect them now. Leave them
   empty and click **Deploy** anyway. You don't have most of them yet, and filling
   them in later through the dashboard is easier.

Wait about a minute. When it finishes you'll get a URL like
`https://whatsapp-assistant-abc123.vercel.app` — **write it down**, every later step
needs it.

Visiting that URL now shows a short landing page. That's the app running with no
credentials, which is exactly right at this stage.

<details>
<summary>Prefer to do it without the button?</summary>

Fork this repo on GitHub, then go to <https://vercel.com/new>, choose **Import Git
Repository**, pick your fork, and click **Deploy**. Same result — the button just
does both steps at once.

</details>

### How you'll change settings later

You will come back to Vercel several times to add variables. The route is always:

**Your project → Settings → Environment Variables → Add New.** Set each one for the
**Production** environment.

> **Environment variables don't take effect until you redeploy.** Adding a variable
> changes the setting, not the running app. After adding or changing any of them:
> **Deployments** tab → the top deployment → **⋯** → **Redeploy**. Forgetting this
> is the most common reason a step "doesn't work" when everything looks correct.

## 2. Everything else happens in the wizard

Open your deployment and add `/setup?key=` plus a `SETUP_SECRET` you invent:

```
https://YOUR-APP.vercel.app/setup?key=YOUR_SETUP_SECRET
```

Add `SETUP_SECRET` in **Settings → Environment Variables** first, then
**Deployments → ⋯ → Redeploy**, or the page will 404.

From there the wizard owns the rest. It tells you what each setting is for and
where to get it, calls Anthropic, Notion and Meta to prove your credentials really
work, builds your Notion pages for you, walks you through the Meta setup in the
order that actually works, and shows you the exact callback URL to paste in.

These instructions deliberately live in the app rather than here, because the app
is the only thing that can check whether you got them right. Two copies of a
procedure drift apart, and the stale one is always the one being read.

### What you're signing up for

So you know before you start:

- **Three accounts** — Anthropic, Notion, Meta — and roughly 45 minutes, most of it
  clicking around Meta's dashboard.
- **Meta is the tedious part.** Business app, system user, permanent token, webhook
  verification. Nothing can automate it; the wizard just tells you what to click and
  checks the result.
- **Use Meta's free test number, not your own.** A number registered to the Cloud API
  can no longer be used in the normal WhatsApp app.
- **Running cost is near zero.** Vercel Hobby, Notion and Meta's test number are free;
  Claude Haiku on short messages is fractions of a penny each.

## Troubleshooting

The wizard has a troubleshooting section that stays in step with the code — start
there. The two failures worth knowing up front:

- **It worked yesterday and is silent today.** Your WhatsApp token expired. The
  temporary one on Meta's API Setup page lasts 24 hours; you need a System User
  token with no expiry.
- **A change had no effect.** Environment variables do nothing until you redeploy.

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

## Development

```bash
npm install
npm test          # unit tests for the signature check and sender allow-list
npm run dev
```

## Licence

MIT.
