# Beyond BMI patient portal — rules for any Claude session

**Read `docs/HANDOVER.md` first.** It covers the current state, how to run the portal, what's done, what's pending and where everything lives.

## Hard rules (from Art, the client lead — do not bend them)
1. **Change nothing in AWS.** The live patient app (app.beyondbmi.ie) runs on the Beyond BMI AWS: backend, Lambdas, Cognito, database, and Stripe through the backend.
   - No code, config, schema or deploy changes there, on QA or prod, until Art lifts the freeze.
   - The portal may only call the backend endpoints that already exist, the same way the live app does.
2. **Semble is the source for everything the patient sees about their care:** products, bookings, video links, patient data, results, prescriptions and dashboard content. Read them from Semble's API and write them back through it.
   - AWS keeps only business data: account and sign-in, plan and payments (Stripe), journey stage.
   - **That is the target, not today's code.** Today weights, GP, address and the questionnaire still come from AWS, and weights and addresses are also POSTed there (see HANDOVER §7 N3/N6). Keep those AWS writes — the live app uses them.
3. **Semble: sandbox only.**
   - Use `https://open.sandbox.semble.io/graphql`. Never production.
   - Never use another client's Semble token (ADHD Now, AutismCare).
   - The token lives only in `.env.local`, server-side. Never give it a `NEXT_PUBLIC_` prefix and never print it.
   - **Sandbox writes need Art's OK first**: API mutations, test bookings, new patients. Only on the test patients (HANDOVER §6).
   - Log each write in `~/Desktop/Work/Projects/Clients/Beyond BMI/Workspace/BBMI_Semble_Sandbox_Log.md`, with a rollback line.
   - Never set `PORTAL_ALLOW_PRODUCTION`: that is the switch that lets the portal reach production Semble.
4. **No test data or seeding on QA** without Art's specific OK. Using the portal normally with the test account is fine.
5. **Nothing client-visible may contain "claude" or "AI"** — test names, emails, notes, copy. Use `ZZTest` / `qa-test@` style identities.
6. **Git:**
   - Work on `main` (Art's decision).
   - The commit author must be `ernesthajdini`. It is already set in this clone's git config; check with `git config user.email` and never change it.
   - **No `Co-Authored-By: Claude` trailer**, ever.
   - `git fetch` and integrate `origin/main` before every push.
   - Commit or push only when asked. Ask Art before any push: whether a Vercel project deploys `main` automatically is unconfirmed (DEPLOY.md is out of date). Never run `vercel`.
7. **Never type passwords into Cognito sign-in.** Art signs in himself. Ask him to.
8. **Don't contact Semble.** The question list is Art's, for his meeting.
9. **"Ready" means verified end to end in the running portal**, with proof. Type-check, lint and build passing is not "ready".
10. **Keep demo mode working.** Every real-mode change branches on `user.backend` or `authMode()`.
    - In real mode, copy must only promise what is actually true.
    - Check `npm run build`, `npx tsc --noEmit` and `npx eslint src` before saying anything is done.
