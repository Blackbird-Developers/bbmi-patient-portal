# DESIGN.md — portal design system

*Tokens live in `src/app/globals.css` (Tailwind v4 `@theme`). Primitives live in `src/components/ui`. This file is the human-readable contract. Brand source: `beyondbmi-wordpress/site/css/tokens.css`; research: `docs/research/03_brand_and_promise.md`.*

## Register
"Product mode": a premium clinical product, not a marketing page. Reference scene from the brand file: *a clinician's consulting room — calm, high-trust, white walls, navy stationery, one quiet ribbon of green.* Dense enough to be useful, calm enough to trust.

## Colour roles (Tailwind class → hex)
| Role | Class | Hex | Use |
|---|---|---|---|
| Canvas | `bg-paper-soft` | #F5F9FB | page background |
| Surface | `bg-paper` | #FFFFFF | cards, sheets |
| Ink | `text-ink` | #053F5C | headings, body |
| Ink soft | `text-ink-soft` | #2B5165 | secondary text |
| Muted | `text-muted` | #5C6F77 | meta, labels |
| Chrome | `bg-ink` / `bg-ink-deep` | #053F5C / #032E45 | left rail, top bar, primary button |
| Interactive | `text-blue-text` | #225A75 | links (AA on white) |
| Selected | `bg-blue-soft` + `border-blue` | #E6EFF4 / #65A1BC | selected day/slot/tab |
| Accent fill | `bg-blue` | #65A1BC | icons, selected day cell, progress bar — **never white text on it** |
| Positive | `text-lime-text` on `bg-lime-soft`; line `lime` | #266314 / #DCEFCC / #A5DB73 | completed ticks, weight-down delta, chart line |
| Warn | `text-warn` on `bg-warn-soft` | #B34433 / #F9E5E1 | payment issue, errors only |
| Notice | `text-amber` on `bg-amber-soft` | #B26A00 / #FBE3CE | "available from", "action needed (non-error)" |
| Divider | `border-divider` / `border-divider-soft` | #E2E8E5 / #F0F2F4 | hairlines |

**Primary button = navy** (`bg-ink` white text, 11:1). Secondary = white with `border-divider`, ink text. Tertiary = `text-blue-text` link with `→`. Lime never carries text. Red only for true errors and payment failure.

## Type (Poppins, local)
- Page title `text-2xl font-semibold tracking-tight` (24px)
- Card title `text-base font-semibold` (16px)
- Body `text-[15px] leading-relaxed`
- Meta / labels `text-xs text-muted` (12px) — labels `font-medium`
- Eyebrow `.eyebrow` (uppercase, 0.72rem, tracked, blue-text) — sparingly, one per card max
- Numbers `tabular` (weights, dates, prices); big stat `text-3xl font-semibold tabular`

## Shape & elevation
Radii: chips/inputs 8px (`rounded-sm`), cards 16px (`rounded-lg`), sheets 20px (`rounded-xl`), buttons pill. One shadow family (`shadow-card`), navy-tinted. No hover-lift on content cards. Buttons: 44px min height, pill.

## Spacing
4/8/12/16/24/32. Card padding 20px (`p-5`); mobile 16px. Section gap 24px. Content max width 1120px; two columns on ≥1024px (main 1fr, context rail 320px).

## Shell
- ≥1024px: 248px navy left rail (logo lockup, 5 nav items with icons, care-team snippet, persona switcher at the bottom in demo mode) + content column + optional right context rail.
- <1024px: navy top bar (logo, avatar) + bottom tab bar (Home · Prescriptions · Progress · Care · Account), 44px targets, active tab in `blue-soft` pill.
- A skip link. Visible focus ring (3px blue at 55%). Reduced motion honoured.

## Components (in `src/components/ui`)
`Button` (primary/secondary/ghost/danger, sizes), `Card` (+ `CardHeader`, `CardTitle`), `StatusTag` (statuses: done · booked · book-now · locked · missed · info · warn · paused), `Avatar` (initials, role colour ring), `PageHeader` (title, sub, actions), `EmptyState`, `Skeleton`, `ProgressRing`, `Sheet` (modal on mobile, dialog on desktop), `Field`/`Input`/`Select`/`Textarea`, `Tabs`, `ListRow`, `Callout` (info/notice/warn/positive), `CareCard` (when to get help: non-urgent / urgent / emergency — Irish numbers), `Sparkline`.

## Icons
Lucide, 1.75px stroke, 16/20/24. No emoji in UI. No medical stock icons.

## Motion
150/200/320 ms, `ease-out-soft`. Page enter: `.fade-up` on the main column only. Skeletons on fetch > 200 ms, spinners only on submits > 800 ms. No bounce.

## Accessibility
WCAG 2.2 AA. 44pt targets. Every status tag has text, not colour only. Every form field has a visible label. Errors: quiet, specific, recoverable. Times always with the Dublin day-name ("Thu 18 Sep, 10:30").

## Copy patterns
- Card title = the thing ("Next appointment"), sub = the fact ("Thu 18 Sep, 10:30 · Dr Niamh Keogh · 25 min video"), one primary action ("Join video call").
- Rule beside the control: "Reschedule · 24 hours' notice".
- Money: "3 monthly payments of €150 · next on 3 Oct".
- Never: "Don't forget!", "Oops", "Something went wrong", streak flames, exclamation marks.
