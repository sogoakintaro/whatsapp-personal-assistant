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

Deploy this repo to Vercel. Leave the environment variables blank for now — you'll
fill them in as you go, and the deploy succeeds either way.

## 2. Notion

1. Go to <https://www.notion.so/profile/integrations> → **New integration** (internal).
   Give it **Read content** and **Insert content**.
2. Copy the **Internal Integration Secret** → `NOTION_TOKEN`.
3. In Notion, make **one** page to hold everything (call it *Assistant*, or anything).
4. On that page: **•••** → **Connections** → add your integration. **This step is the
   one everyone forgets**, and without it nothing can be created.
5. Copy the 32-character id out of the page URL → `NOTION_PARENT_PAGE_ID`.

## 3. Anthropic

Create a key at <https://console.anthropic.com> → `ANTHROPIC_API_KEY`.

## 4. Set the variables and redeploy

In Vercel → Settings → Environment Variables, add everything from `.env.example`
that you have so far, plus a `SETUP_SECRET` you invent. Redeploy.

## 5. Run the setup wizard

Open `https://YOUR-APP.vercel.app/setup?key=YOUR_SETUP_SECRET`.

Work down the page: it shows which variables are missing, tests that your
credentials really work, and builds your Notion pages for you.

## 6. WhatsApp — do this after deploying, not before

**Order matters.** Meta verifies the webhook by calling your app, so the app has to
be live with `WHATSAPP_VERIFY_TOKEN` already set before step 8 will work.

1. Create an app at <https://developers.facebook.com/apps> → type **Business**.
2. Add the **WhatsApp** product. Meta gives you a free **test number**.

   > **Do not register your own phone number.** A number attached to the Cloud API
   > can no longer be used in the normal WhatsApp app. Use Meta's test number and
   > message *it* from your personal WhatsApp.

3. Under **WhatsApp → API Setup**: copy the **Phone number ID** →
   `WHATSAPP_PHONE_NUMBER_ID`, and add your own number as an allowed recipient
   (you'll get a code to confirm). The test number can message up to 5 verified
   recipients, which is plenty for personal use.
4. **App Settings → Basic → App Secret** → `WHATSAPP_APP_SECRET`.
5. Create the access token → `WHATSAPP_TOKEN`.

   > **The temporary token on the API Setup page expires in 24 hours.** If you use
   > it, your assistant will work today and go silent tomorrow, and it will look
   > like the code broke. Instead: **Business Settings → Users → System Users** →
   > create one → give it `whatsapp_business_messaging` → generate a token with no
   > expiry.

6. Set `WHATSAPP_ALLOWED_SENDERS` to your own number (digits, with country code).
   Anyone not on this list is silently ignored. An empty list blocks everyone.
7. Redeploy so the new variables take effect.
8. **WhatsApp → Configuration → Webhook** → Callback URL
   `https://YOUR-APP.vercel.app/api/whatsapp`, verify token = your
   `WHATSAPP_VERIFY_TOKEN`. Click **Verify and save**.
9. Under **Webhook fields**, subscribe to **`messages`**. Nothing arrives until you do.

## 7. Try it

Message the test number from your phone:

- *"remind me to email the plumber on Friday"* → a checkbox with a date chip
- *"learned that defaults should change as users gain trust"* → a bullet under this month in Learnings
- *"what if onboarding had a voice-first mode"* → a bullet under this month in Musings

You should get a reply with a link within a few seconds.

## 8. Lock the wizard

Delete `SETUP_SECRET` in Vercel and redeploy. `/setup` and its API routes now 404
for everyone. Put it back whenever you need to return.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Webhook won't verify | App isn't deployed yet, `WHATSAPP_VERIFY_TOKEN` doesn't match, or you used a preview URL instead of the production one |
| Worked yesterday, silent today | The 24-hour temporary token expired. Use a System User token |
| No reply at all | Your number isn't in `WHATSAPP_ALLOWED_SENDERS` (digits only), or you didn't subscribe to `messages` |
| "I can't find your Todo page" | Run **Create my Notion pages** in `/setup`, or you renamed a page — the titles must stay Todo / Learnings / Musings |
| Notion 404 in `/setup` | The parent page isn't shared with the integration (••• → Connections) |
| Goes to the wrong to-do list | `NOTION_TODO_SECTIONS` must match the headings on your Todo page |

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
