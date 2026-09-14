# Deploying the prototype

This is a **demo build**. It runs on a mock Semble adapter with synthetic patients and must never be pointed at a real Semble tenant or a real Stripe account.

## Environment variables

Set these in Vercel → Project → Settings → Environment Variables, for Production and Preview:

| Name | Value | Why |
|---|---|---|
| `SEMBLE_ADAPTER` | `mock` | Forces the in-memory demo adapter. The code already defaults to `mock`, but set it explicitly so a stray token can never flip it. |
| `PORTAL_SESSION_SECRET` | any long random string | Placeholder for the real session signer. |

**Do not set** `SEMBLE_API_TOKEN`, `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` on this project. If `SEMBLE_API_TOKEN` is present and `SEMBLE_ADAPTER=graphql`, the app will try to talk to a live practice.

## Deploying

The org repo is private, so how you deploy depends on the Vercel account.

**If the Vercel team can install the GitHub app on `Blackbird-Developers`** (any paid team, or a personal account that has been granted access to the org): connect the repo in the Vercel dashboard and every push to `main` deploys itself. This is the preferred setup.

**If it cannot** (this is what happened with the marketing site: a Hobby account cannot install the GitHub app on a private org repo), deploy from the command line instead:

```bash
npx vercel link      # once: pick the scope and project
npx vercel --prod
```

Add `--token <token>` in a non-interactive shell.

## Region

`vercel.json` pins the deployment to `dub1` (Dublin). Keep it there. Even with synthetic data it sets the right default for an Irish clinic, and it is where this has to run once real patient data is involved.

## The demo is noindex

`vercel.json` sends `X-Robots-Tag: noindex, nofollow` on every response and `public/robots.txt` disallows everything. A patient portal mock-up carrying the client's brand must not end up in search results. Leave both in place.

## Known limitation on serverless: demo state

The demo's mutable state (a booking you make, a weight you log, a plan you change) lives in memory in the running server process. On a single local `npm run dev` that is rock solid, which is why the local run is the best surface for a live walk-through.

On Vercel each request is served by a serverless instance, and instances come and go. In practice a single person clicking through usually stays on one warm instance and everything behaves. But a cold start, or two requests landing on different instances, resets the demo to its seeded state. The effect is "the appointment I just booked is not there", not a crash.

What this means in practice:

- **The six seeded journeys are the demo and they are always correct.** Every state the client needs to see (consultation paid, programme running, payment paused, programme complete) is seeded, not created.
- **Live mutations are a bonus on the hosted version.** If you want to demo booking an appointment end to end, do it on the local run.
- If the hosted version needs to hold state reliably, the fix is to move the demo store behind Vercel KV or to persist mutations in a signed cookie. Neither is built; both are a contained change to `src/lib/portal/store.ts` and `src/lib/semble/mock.ts`.

## Before this ever carries real data

None of the following is done, and all of it is required first: real authentication (the current session is a cookie holding a demo user id), the Semble adapter verified against a Beyond BMI tenant with a Beyond BMI token, Stripe wired to the live catalogue, a data-protection review, and the decisions listed on the `/architecture` page.
