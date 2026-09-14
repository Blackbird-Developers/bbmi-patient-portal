# Presenting the prototype — a 12-minute walk-through

Start the app (`npm run dev -- --port 3050`), open http://localhost:3050, and use the **Demo: switch patient** panel at the bottom of the left rail. Suggested order and the point each screen makes.

## 1. Seán — just paid €89 (`consult_paid`) · 2 min
- **Home**: navy card "Your consultation is paid — one step first". The questionnaire gates *booking*, not navigation. Task list below shows what's done and what's next; nothing overlays anything.
- Click **Start questionnaire** → submit → "Thank you" → **Book your consultation** → pick a time → confirm. Home now says "Your consultation is booked" with the Join button rule (opens 1 hour before).
- Point: this is the 8-Sep production journey (pay → verify → questionnaire → book) rebuilt on Semble availability and bookings.

## 2. Aoife — day 12 after the consultation (`consult_done`) · 2 min
- **Home**: treatment has started. Next-injection card, weigh-in card, prescription tracker in the rail, nurse message with "1 new". No upsell hero; the 90-Day offer is a quiet card.
- **Treatment**: dose log with injection-site rotation and side-effect chips, missed-dose rule, titration plan, prescription tracker (issued → sent → dispatched → runs out), 30-day prescription-window notice, PDF minted on click.
- **Care**: the message thread and composer with published reply times.
- **Plans** → **Pay €399 & start** → Home flips to "Day 1 of 90" with the Month 1 booking tasks and community access.

## 3. Ciarán — day 38 of 90 (`ninety_day_active`) · 3 min
- **Home**: Day-of-90 headline, next appointment (nurse check-in), next dose + weigh-in side by side, the 8-step MDT list in month bands with **Done / Booked / Book / Not yet**, and the instalment line (2 of 3 paid, next on 4 Oct).
- **Programme**: the same steps with "How booking works" (in order per role, ±7-day windows, 24 h notice, allocation counters) and the programme clock.
- Click **Book** on health coach session 2 → the picker only offers days inside the window and shows when it closes → confirm → session 3 unlocks. That is the client's scheduling rule, enforced server-side.
- **Progress**: weight trend with goal line, weekly log, non-scale wins.

## 4. Dara — instalment failed (`ninety_day_overdue`) · 1 min
- **Home**: one red card, one action — **Pay instalment and resume** (opens the open Stripe invoice, never a new checkout). Appointments are kept, Book buttons locked, join locked.
- Click it → "Payment received — your programme has resumed", Day 47, booking open again.

## 5. Fiona — day 92 (`ninety_day_completed`) · 1 min
- **Home** → **See your options**: results summary, then Ongoing Care €75 vs full MDT €150, plus "prefer a break".
- Choose €75 → "You're on Ongoing Care", quarterly review bookable.

## 6. Margaret — Ongoing Care member (`legacy_member`) · 1 min
- **Appointments**: quarterly doctor, monthly nurse, and the **Extra sessions** card (Doctor €80 · Coach €50 · Dietitian €60 · Nurse €40) — each opens the same booking flow with "billed to your card at booking".

## 7. `/architecture` · 2 min
- The system diagram (patient → portal → Semble / Stripe / HubSpot; pharmacies), who-owns-what, the Semble facts that shaped the design, the nine journey stages, real-vs-mocked, the six-phase roadmap and the decisions list.

## Things to say plainly
- Semble has no patient login and no dashboard — its "portal" is an emailed document link. The patient-facing product is ours; Semble is the clinical back-end.
- Stripe stays the biller (Semble Pay is not available in Ireland; no recurring billing).
- Every rule is decided on the server; the screens mirror it. Overdue members never get a fresh checkout.
- Nothing here has touched a real Semble tenant; the real adapter is written but unverified until Beyond BMI's token exists.
