# 03 — Brand system and the marketing promise the new patient portal must live up to

Research slice for the Semble-backed patient portal that replaces `patients.beyondbmi.ie` (Angular 14). Date: 2026-09-11. Author: Blackbird (Claude research pass). Nothing in any repo was modified; no live API was called.

**Source root** `R` = `C:/Users/Admin/Desktop/Work/Projects/Clients/Beyond BMI/code/beyondbmi-wordpress`. Line refs are `file:line`. Live-site facts were read from https://beyondbmi.ie on 2026-09-11 (page text + screenshots).

**Provenance caveat (read first).** The local clone sits on `feat/applepay-and-90day` (HEAD `3175482`, 2026-08-31). The site actually deployed to beyondbmi.ie is the WordPress theme in `R/wp-theme/`, deployed by WP.com GitHub Deployments (`R/wp-theme/README.md:3-16`), and the branch that carries today's live copy is **`origin/feature/wp-theme`** (tip `c194b2c`, 2026-09-11) — the "Talk to Care-Coordinator Team" nav pill (`4dccbac`) and the "Oral weight-loss support" announcement bar (`9dd2209`) exist only there. `R/site/*.html` is the older static build (still what `origin/vercel` stages) and is **behind the live copy on pricing and journey**: it still sells a €150/month membership and a "free care call → doctor" journey, whereas the live site sells €89 consultation → 90-Day Programme → ongoing care. Design tokens are identical across `site/`, local `wp-theme/` and `origin/feature/wp-theme` (`git diff` on `tokens.css` is empty apart from a `--bb-trustpilot`→`--bb-google` rename), so the token section below is safe; the **copy/plan sections cite the live WP templates**, not `site/`.

---

## TL;DR

1. **The brand is "premium-medical, not wellness-cute"**: deep navy ink `#053F5C` on white, clinical blue `#65A1BC` as the accent, lime `#A5DB73` demoted to "one quiet ribbon of green", Poppins everywhere, big radii and soft navy-tinted shadows (`R/site/css/tokens.css:1-8, 57-157`). That is the intended system (v3). It is not what the live buttons do — see 2.
2. **The primary button colour is unresolved.** `site/css/components.css:28-32` makes `.btn-primary` clinical blue; the deployed theme overrides it to `--bb-green-deep` `#6FAF42` (`R/wp-theme/css/components.css:28-39`), a colour the token file itself annotates "fails AA on white for text" (`tokens.css:73`). Both white-on-blue (≈2.9:1) and white-on-green (≈2.7:1) fail WCAG AA [computed]. The portal must pick a compliant primary (navy `#053F5C` ≈11:1 or `--bb-blue-text` `#225A75` ≈7.5:1) — decision for Art.
3. **The promise is now a three-stage ladder, not a membership**: €89 one-off doctor consultation (25 min video, SCOPE-certified doctor) → 90-Day Programme €399 upfront / 3×€150 (standard €450) → "ongoing care" (marketed without a price; the Terms define **Premium €150/month** and **Core €75/month**). Medication is *never* included; paid at pharmacy cost, optionally delivered (`R/wp-theme/page-templates/pricing.php:139-224`; `terms.php:1367-1581`).
4. **The Terms turn marketing into entitlements the portal must count and enforce**: per-product appointment tables (doctor M1/M3, dietitian M1/M3, nurse M2, coach monthly, day-80 review, day-5-7 nurse call, day-21 coordinator call), 24-hour reschedule notice, no-show rules, "unused entitlements expire", "appointments must be booked through the Platform" (`terms.php:1367-1640`, Schedule 2). This is the functional spec hiding inside the brand promise.
5. **Care team as marketed**: SCOPE-certified obesity doctors (GPs, endocrinologists, professors), a Head of Dietetics + clinical dietitian, a clinical support nurse, health coaches, psychologists (mentioned, none named), a Senior Care Coordinator (Joanna Bridgett) and customer success. Every doctor "registered with the Irish Medical Council" — the portal should show clinician role, credentials and IMC verifiability.
6. **Trust signals are the brand**: 4.9 Google, 3,000+ patients, 25+ specialists, 100% SCOPE-certified, institutions (UCD, St Vincent's, Imperial, Ulster), press (RTÉ, Irish Independent, Image, The Currency, Business Post), "No judgement · No quick fixes · No blaming". Caveat: the review cards are **illustrative placeholders** (`R/site/reviews.html:401-402`) — never port them into the portal.
7. **Tone rules exist in writing** (client Content Guideline + Social Pillars, summarised in `R/CHANGELOG-feedback-2026-05-06.md:198-215`): simple, empathetic, people-first, evidence-based; no "Take control!", no sensational numbers, no "quick fix" framing. The portal's microcopy must follow them.
8. **The old app** (two marketing renders, `R/site/assets/img/app/*`) was a native-style mobile app: lowercase "Beyondbmi" wordmark, tagline "Begin with your biology", a brighter cyan login button, a Weight Tracker with a lime line chart and a five-tab bar (Appointments · Rx · Tracker · 1:1 Chat · Community). Marketing now calls the product "the BeyondBMI **web app**" / "Web Platform".
9. **Recommendation**: keep the brand's atoms (Poppins, navy/blue/lime roles, soft-blue surfaces, stroke icons, pill steppers), drop the marketing scale (4.2rem display type, 28–36px radii, hover-lift cards, blob gradients, marquees, pastel bento tints, auto-popups), and build a denser, calmer clinical UI: navy chrome, white cards on `#F5F9FB`, 8/12/16px radii, tabular numerals, lime reserved for "progress/positive", blue for interactive/selected. Full token proposal in §6.

---

## 1. Design tokens (exact values)

### 1.1 Colour roles — `R/site/css/tokens.css:57-100` (identical in `wp-theme`)

| Token | Value | Declared role |
|---|---|---|
| `--bb-blue` | `#65A1BC` | "primary CTA, key accents" (line 59) |
| `--bb-blue-deep` | `#3F7E99` | hover (60) |
| `--bb-blue-text` | `#225A75` | "AA-compliant blue for text accents on white" (61) |
| `--bb-blue-soft` | `#E6EFF4` | tint bg for badges/highlights (62) |
| `--bb-blue-wash` | `#F5F9FB` | near-white blue tint for alt sections (63) |
| `--bb-ink` | `#053F5C` | deep navy — body, headings, brand (66) |
| `--bb-ink-deep` | `#032E45` | deeper navy for dark surfaces (67) |
| `--bb-ink-soft` | `#2B5165` | secondary text (68) |
| `--bb-muted` | `#5C6F77` | AA-compliant muted grey (69) |
| `--bb-green` | `#A5DB73` | "small accents only — highlight pills, dots" (72) |
| `--bb-green-deep` | `#6FAF42` | "rare hover/UI — fails AA on white for text" (73) |
| `--bb-green-text` | `#266314` | AA-compliant green as text accent (74) |
| `--bb-green-soft` | `#DCEFCC` | tint for highlight badges (75) |
| `--bb-paper` | `#FFFFFF` | primary background (78) |
| `--bb-paper-soft` | `#F5F9FB` | alt section bg, subtle blue tint (79) |
| `--bb-paper-warm` | `#F7F3ED` | warm cream wash for editorial sections (80) |
| `--bb-card` | `#FFFFFF` | card surface (81) |
| `--bb-divider` / `-soft` / `-dark` | `#E2E8E5` / `#F0F2F4` / `rgba(255,255,255,.16)` | borders (82-84) |
| `--bb-dark` / `-deep` / `-card` | `#053F5C` / `#032E45` / `#0A4D70` | inverted sections (87-89) |
| `--bb-dark-text` / `--bb-dark-muted` | `#F2F4F4` / `#94B1BF` | text on navy (90-91) |
| `--bb-positive` / `--bb-warn` | `#2F7A4D` / `#B34433` | functional (94-95) |
| `--bb-trustpilot` (site) / `--bb-google` (wp) | `#00B67A` / `#F4B400` | third-party marks (96; wp-theme diff) |
| `--bb-google-yellow` | `#FFB400` | stars (97) |
| `--bb-shadow` / `-soft` / `-deep` | `rgba(5,63,92,.08)` / `.04` / `.18` | navy-tinted shadows (98-100) |

Design intent, verbatim from the file header: "COMMITTED clinical blue. Deep navy carries body/ink, clinical blue carries CTAs and key accents. Lime drops to a small highlight role. Reference scene: a clinician's consulting room — calm, high-trust, white walls, navy stationery, one quiet ribbon of green. Premium-medical, not wellness-cute." (`tokens.css:3-7`). `meta theme-color` is `#053F5C` (`R/site/index.html:9`).

**Conflict to know about.** `R/site/README.md:88-104` (April 2026) documents an earlier system with lime as "Primary CTAs, accents — the signature" and `--bb-green-deep` for "Hover states, button bg only". v3 tokens (above) demoted lime; the deployed theme then re-promoted green for buttons (§1.5). Three generations of "primary" coexist.

**Off-token colours actually used in components** (`grep` of `components.css`; counts are occurrences): bento/drawer pastel tints `#FBE3CE`, `#F5DDC8`, `#F2D5BD` (peach), `#E5EDF1`/`#D6E2EA` (blue), `#F5EFE6`/`#EDE5D8` (cream), `#E2EED9`/`#D2E4C5` (mint) (`components.css:4163-4169`, `layout.css:304`); popup gradient `#FBE3CE→#F7E3D4→#F2EBE3→#EDEEF2` (`5690-5691`); "Start here" ribbon `#E89A47` (`3344`); Klarna pill `#FFB3C7`/`#17120F` (`3428-3441`); dark-green chart ink `#1F3621` (popup chart, `main.js:1149`); price-card asides `#DCEAF1→#EFF6F9` (consult), `#E1F0D2→#F2F8EB` (programme) (`wp-theme/css/components.css:9064-9065`); warning banners `#FFF6E6`/`#F0C97A`/`#6C4B0F` (`3912-3922`) and widget `#fff8e6`/`#f0d48a` (`widget.css:150`), widget error `#fbeeec`/`#edcfc9` (`widget.css:91-92`); soft final-CTA blobs peach `rgba(255,184,140,.45)` + blue + lime (`1259-1264`). None of these are tokens; the portal should not inherit the peach/cream family (see §6).

### 1.2 Typography — `tokens.css:10-55, 103-128`, `base.css:27-37, 63-107`

- Family: **Poppins** only (`--font-display`, `--font-body`, `--font-numeric` all Poppins; fallbacks `system-ui, -apple-system, sans-serif`). Self-hosted WOFF2 latin subset, weights 400/500/600/700/800 at `/assets/fonts/poppins-NNN.woff2` (`tokens.css:16-55`); `site/*.html` still load Google Fonts (`index.html:27-29`).
- Scale: `--fs-h1: clamp(2.5rem, 5.2vw, 4.2rem)`; `--fs-h1-mega: clamp(3rem, 6.4vw, 5.2rem)`; `--fs-h2: clamp(2rem, 4.2vw, 3.1rem)`; `--fs-h3: clamp(1.35rem, 2.4vw, 1.8rem)`; `--fs-h4: 1.2rem`; `--fs-eyebrow: 0.72rem`; `--fs-body: 1.02rem`; `--fs-body-large: 1.15rem`; `--fs-small: 0.9rem`; `--fs-stat: clamp(2.6rem, 5vw, 3.8rem)` (108-117).
- Line heights `--lh-tight 1.02`, `--lh-snug 1.18`, `--lh-normal 1.5`, `--lh-relaxed 1.7` (120-123). Letter-spacing `--ls-eyebrow .18em`, `--ls-display -.03em`, `--ls-display-mega -.04em` (126-128).
- Body: 400, `--fs-body`, `--lh-relaxed`, colour `--bb-ink`, antialiased (`base.css:27-37`). Headings: 700 (h3/h4 600), `--lh-tight`, `--ls-display`, colour ink (`63-92`). `p { max-width: 65ch }` (110). `strong` 600 ink (104-107).
- Accent device: `em` is **not italic** — it is a clinical-blue phrase `--bb-blue-text` (`base.css:96-100`); `.bb-em-lime`/`.eyebrow-lime` variants; `.bb-underline` = lime highlighter gradient at 55% alpha (`194-199`). On dark sections `em` flips to lime (`layout.css:729`).
- Eyebrow: `span.eyebrow` 0.72rem/600/uppercase/.18em/`--bb-blue-text` (`base.css:172-181`). Lede: `p.lede` 1.15rem, ink-soft, 60ch (`202-208`).
- Numbers: `.stat-num` uses `font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1` (`components.css:330-343`); same on `.stats-bar-num` (`1837-1845`) and `.team-feature-stat-num`. Live in-page sizes cluster at 0.95rem (37 uses), 0.78rem (34), 0.85rem (27), 1rem, 0.92rem, 1.1rem.
- Selection `background: --bb-green; color: ink` (`base.css:114-117`); focus ring `2px solid --bb-green-deep`, offset 3px (`120-124`).

### 1.3 Layout, spacing, radii, shadows, motion — `tokens.css:131-156`

- Containers: `--container 1360px`, `--container-narrow 920px`, `--container-wide 1480px`; gutter `clamp(1.25rem, 4vw, 2.75rem)`; section padding `clamp(5rem, 9vw, 7.5rem)` / tight `clamp(3rem, 5vw, 4.5rem)` (`131-136`; `base.css:158-169`).
- Radii: `--r-sm 8px`, `--r-md 14px`, `--r-lg 20px`, `--r-xl 28px`, `--r-2xl 36px`, `--r-pill 999px` — "slightly larger for premium feel" (`138-144`). Usage counts across components/layout: `50%` ×42, `--r-pill` ×37, `--r-md` ×21, `--r-lg` ×18, `--r-2xl` ×12, `--r-xl` ×11.
- Shadows (most used): `0 24px 60px var(--bb-shadow)`, `0 16px 40px var(--bb-shadow)`, `0 12px 40px var(--bb-shadow-soft)` (stats bar), `0 8px 24px -16px var(--bb-shadow)` (booking cards), card hover `0 16px 40px` + `translateY(-2px)` (`components.css:154-158`).
- Motion: `--ease-out cubic-bezier(.16,1,.3,1)` ("expo, no bounce"), `--ease-in-out cubic-bezier(.65,0,.35,1)`, `--dur-fast 180ms`, `--dur 320ms`, `--dur-slow 720ms` (`147-151`); `prefers-reduced-motion` kills all animation (`base.css:17-25`). Z-index `--z-nav 50`, `--z-modal 100` (`154-156`).

### 1.4 Component recipes (copy these)

**Buttons** — `components.css:7-137`. Base `a.btn, button.btn`: inline-flex, gap .6rem, 500, 1rem, `-.005em`, padding `.95rem 1.6rem`, `--r-pill`, transitions on transform/shadow/bg/colour. `.btn-primary` **site**: bg `--bb-blue`, white, `0 8px 24px rgba(101,161,188,.35)`; hover `--bb-blue-deep`, `translateY(-2px)`, `0 14px 32px rgba(63,126,153,.45)` (28-39). `.btn-primary` **deployed**: bg `--bb-green-deep`, white, `0 8px 24px rgba(111,175,66,.35)`; hover `--bb-green` (`wp-theme/css/components.css:28-39`). `.btn-ink`: navy, white, `0 8px 24px rgba(5,63,92,.25)`; hover `--bb-ink-deep` (41-53). `.btn-secondary`: transparent, ink text, `1.5px solid --bb-ink`; hover fills navy (55-65). `.btn-ghost`: `rgba(255,255,255,.92)` + `backdrop-filter: blur(8px)` (67-76). `.btn-on-dark` inverse (79-93). `.btn-lg`: `1.1rem 2rem`, 1.05rem, 600 (96-100). `a.link-arrow`: ink 500 with `→` that slides 4px on hover, hover colour `--bb-blue-text` (103-126). `p.cta-meta` .82rem muted, `.02em` (129-137). Sticky bottom pill button: `--bb-ink-deep` (`layout.css:410-429`); deployed homepage variant: bg `--bb-green` with **ink** text (`home-ui-refresh.css:112-133`).

**Cards** — `div.card`: white, `1px solid --bb-divider`, `--r-lg`, padding 2rem; hover lift + shadow + border `--bb-blue-soft` (141-158). `.card-accent` top gradient from `--bb-blue-soft` (161-164). `.card-dark` `--bb-dark-card` (166-173). Clinician card: 96px round photo with 3px white border, name 1.25rem, `.role-line` .88rem muted, `.creds` .78rem italic, `.imc-link` uppercase .78rem dotted underline with `↗` (844-921).

**Badges / pills / tags** — `span.badge`: 0.72rem/600/uppercase/.18em, `--bb-blue-text` on `--bb-blue-soft`, `1px solid --bb-blue`, padding `.4rem .95rem`, pill (177-190); `.badge-lime` (192-196); `.badge-dot::before` 6px pulsing dot (198-211). `.tag`: 0.7rem/.08em uppercase, muted on paper with divider border (218-226). `span.trustpilot-pill` / `span.google-badge`: white pill, divider border, `0 4px 12px shadow-soft`, stars `#FFB400` (1713-1764). `.bb-incl-when` chip: `.08rem .5rem`, pill, `--bb-blue-soft`/`--bb-blue-text`, .7rem/600 (`wp-theme/css/components.css:3053`).

**Inputs** — marketing booking form `.booking-field`: label .82rem/600 ink; input/select/textarea `padding .7rem .9rem`, white, `1px solid --bb-divider`, `--r-md` (14px), .95rem; focus `border-color --bb-blue; box-shadow 0 0 0 3px --bb-blue-soft`; hint .78rem muted (`components.css:3768-3790`). Widget (`R/wp-theme/assets/widget/bbmi-assessment-widget.css`): label .8rem/600 ink-soft; input `10px 12px`, .95rem, radius **8px**; focus `outline 2px solid --w-blue` (63-70); phone field with flag/dial-code segment (235-247); unit toggle pill (297-307); submit `.bbw-btn` full-width, `13px 20px`, radius 10px, bg `--w-green-deep`, 700 (77-84); error box `#fbeeec`/`--w-warn` (89-94); success icon 56px circle `--w-green-soft`/`--w-green-text` (178-182). Callback modal (navy) inputs: white, radius 12px, floating label `#5C6F77`→`#225A75` 10.5px (`components.css:7910-7950`); required mark `#FF7A6B`; error ring `#FF6B6B`, error text `#FFB1A8` (7952-7972). Newsletter `.field` pill with lime button (405-438).

**Stepper / progress** — `ol.booking-stepper li`: .82rem/500 muted pill with divider border; `.is-active` ink text, `--bb-blue` border, `--bb-blue-soft` bg; `.step-pill` 22px circle, active `--bb-blue`, done `--bb-blue-text` (`components.css:3639-3660`). Widget progress: 4px bars, `--w-divider` → `.on --w-blue` (`widget.css:47-52`). Step numbers: 40px navy circle, 700 (`4335-4347`); journey-strip 28px `--bb-blue` circle (6472-6482).

**Calendar & time slots** — `.booking-cal` (`3684-3740`): dow labels .7rem/600/.08em uppercase muted; day cells `aspect-ratio 1`, round, hover `--bb-blue-soft`, selected `--bb-blue` white 600, today `inset 0 0 0 1.5px --bb-blue`, disabled `--bb-divider`. Times: grid `minmax(120px,1fr)`, `.booking-time` `.7rem .95rem`, `--r-md`, hover blue border, pressed blue fill (`3742-3760`). Widget calendar: cells radius 9px, available cells white with divider border, selected **navy** fill, availability dot 4px blue, weekday labels `--w-blue-deep` (`widget.css:210-224`).

**Summary / review / pay** — `.booking-review` dl on `--bb-paper-soft` (`3810-3822`); `.booking-pay-option` radio cards with `:has(input:checked)` blue border + blue-soft bg (`3824-3846`); sticky `aside.booking-summary` at `top:110px`, rows .92rem with blue 18px icons, total 1.6rem/700 (`3884-3910`); trust row .82rem muted with blue icons (`3924-3935`).

**Accordion (FAQ)** — `details.faq-item` with hairline dividers; `summary.faq-q` 600, clamp(1.05–1.2rem), hover `--bb-blue-text`; `.faq-q-icon` 32px circle `--bb-blue-soft`/`--bb-blue-text` rotating 45° to blue fill when open; answer 1rem ink-soft 70ch (`2285-2355`).

**Tables** — `table.compare-table`: white, divider border, `--r-lg`, uppercase .85rem muted headers, "us" column `--bb-green-soft` / `rgba(220,239,204,.4)`, total row 1.4rem (442-536). `.med-table`: navy header 1.1rem 400 white, uppercase .78rem row headers (540-585). Legal table (deployed): min-width 34rem in a scrolling wrapper, uppercase .78rem headers on paper-soft (`wp-theme/css/components.css` "Legal / terms tables").

**Stats** — `div.stats-bar`: white card, divider, `--r-lg`, `0 12px 40px shadow-soft`; 60px `--bb-blue-soft` icon circles; number clamp(1.4–1.75rem)/700 tabular; label .92rem muted (`1800-1872`).

**Price cards (live)** — `.bb-price-card`: 2-col grid `minmax(300px,34%) 1fr`, `--r-2xl`, `0 18px 44px shadow-soft`; aside gradients per stage; `.bb-price-badge` white pill .78rem/600; `.bb-price-name` clamp(1.5–2rem)/700; `.bb-price-was` strike-through with `#B34433` 2px line; ongoing-care card uses the navy gradient with white text; benefit rows are `<details>` with a 26px plus icon that turns green when open (`wp-theme/css/components.css:9032-9099`).

**Nav** — sticky 3-column grid (hamburger+page name | centred logo | phone + Log In), `rgba(255,255,255,.92)` + `backdrop-filter: saturate(180%) blur(16px)`, scrolled state adds divider + `0 1px 24px rgba(5,63,92,.05)` (`layout.css:13-34`). Logo lockup 52px high (`99-107`). Live phone pill is green-soft (`#f0f5ed`/`--bb-green-soft`, text `--bb-green-text` 700) and reads "Talk to Care-Coordinator Team" (`wp-theme/css/layout.css` diff; `origin/feature/wp-theme:wp-theme/header.php:55-62`). `a.nav-login`: white pill, divider border, .9rem/500; hover blue (`142-162`). Side drawer 420px from the left with 44px gradient icon tiles (`175-366`). Deployed homepage refresh sets nav `min-height 4.5rem`, logo `2.75rem`, buttons `2.75rem` tall (`home-ui-refresh.css:31-81`).

**Footer** — navy `--bb-dark`, `5rem 0 2rem`; 4-col `1.6fr 1fr 1fr 1fr`; link text `--bb-dark-muted` .93rem, hover lime; bottom row with 32px white-inverted icon, 34px round social buttons, legal list .82rem (`layout.css:1031-1350`).

**Modals** — BMI/eligibility popup: 760px, radius 28px, peach→cream→blue gradient, `0 30px 80px rgba(5,30,45,.25)`, scrim `rgba(5,30,45,.55)` + blur 3px (`5645-5700`). Callback modal: 420px bottom-right on desktop, radius 20px, navy radial gradient, `0 24px 70px rgba(3,28,42,.45)`, submit pill `#65A1BC` radius 14px with avatar bubble (`7734-8100`). Announcement bar (deployed): `--bb-dark-deep`, `--fs-small`, highlight `--bb-green`, underlined CTA (`wp-theme/css/layout.css` "Announcement bar").

### 1.5 Contrast check on the two "primary" buttons [computed, WCAG relative luminance]

White on `--bb-blue #65A1BC` ≈ **2.9:1**; white on `--bb-green-deep #6FAF42` ≈ **2.7:1**; both fail AA for normal (4.5:1) and large (3:1) text. White on `--bb-ink #053F5C` ≈ **11.2:1**; white on `--bb-blue-text #225A75` ≈ **7.5:1**; `--bb-green-text #266314` on white ≈ 7.3:1. The marketing site's `.btn-ink`, `.pricing-tier--featured` and `.sticky-cta-btn` (navy) are the only AA-compliant filled buttons in the system.

---

## 2. Visual language

**Imagery.** Three families in `R/site/assets/img/`: (a) `lifestyle/` — outdoor, calm movement (man-stretching, woman-hiking, senior-stretching, body-positivity, a father walking a labrador with two children = `homepageupdate.webp`); (b) `newimagery/` — 22 photos of people at home with laptops and coffee, plus-size representation (`plus-size-businesswoman-a/b`), i.e. "remote care from your own kitchen"; (c) `stories/` — four real members (Shirley, Rosie, Cathy Ward, Joy) used with YouTube links (`adult-weight-loss-v2.html:422-538`). Heroes: a four-clinician lab photo (`home-hero-desktop.webp`, doctors with stethoscopes among lab glassware) and a family (`adult-hero-*.webp`). Team headshots are cut-outs on a soft blue→pink gradient (`team/harriet-treacy.webp`). Art-direction rule from the client feedback round: "calmer, broader demographic, more clinical-warm and less performance-fitness"; the intense gym image was removed (`CHANGELOG-feedback-2026-05-06.md:132-147, 201`). Video is used heavily on marketing (`assets/video/*`: how-step1-survey … how-step4-track, membership-instagram, hero-weightloss-pen) — not appropriate in a portal.

**Logo / mark.** `assets/img/logos/bb-logo-text.webp`: ring mark with a small triangular "flag" at top-left + wordmark **"Beyondbmi"** (lowercase bmi) + tagline **"Begin with Biology"**, navy; `bb-icon.webp` is the ring alone; `bb-logo-with-text.webp` is the white-on-transparent version; `bb-icon-large.webp` white. Only WebP raster exists in the repo — no SVG. Copy everywhere else uses "BeyondBMI" (title tags, JSON-LD `name` `index.html:40`, alternateName "Beyond BMI"); `site/README.md` and the wordmark use "Beyondbmi". Favicon = `bb-icon.webp` (`index.html:12`). Footer renders the icon inverted white (`layout.css:1258-1264`).

**Icon style.** 24-viewBox Feather-style stroke icons inline as SVG: `fill: none; stroke: currentColor; stroke-width: 2` (1.75 in drawer/footer, 2.5 in tiny trust rows), round caps and joins (`index.html:160-162, 209, 801`; `layout.css:312-320`). Ticks are 22px `--bb-blue-soft` circles with a `#225A75` stroke-3 check (`components.css:3183-3186`) or the text glyph `✓` in green (`.check`, `.we-are-col.are li::before`). Arrows are text `→`/`›`/`↗`. FAQ uses `+` rotating to `×`. Third-party marks: Google "G" SVG, star glyphs `★` in `#FFB400`.

**Tone of voice and copy patterns** (rules: `CHANGELOG-feedback-2026-05-06.md:198-215`; examples: live templates).
- Rules in force: "simple/non-jargon, empathy + people-first, non-judgemental, medical & evidence-based"; people-first language ("living with obesity", "her biology responded to treatment", health gain over numbers); anti-stance = no quick fixes, no consumerist wellness; no inspirational/transformational/sensational copy, no exaggerated results, no non-expert endorsements (203-215). Concrete edits made under those rules: "Your results are in! They're looking great" → "Here's what your biology suggests is possible" (266-284); "Real doctors, real conversations" trimmed (94-110); "your specialist" → "your BeyondBMI specialist" (255-263).
- Sentence patterns: eyebrow (uppercase label) + H2 with one blue `<em>` phrase ("Lasting change, in *four simple steps.*", "Clear, honest pricing for *lasting* weight loss.") + one-sentence lede. Short declaratives; en-IE spelling; `€89`/`€399` no space; "SCOPE-certified", "Irish-registered", "obesity-medicine doctor", "care coordinator", "multidisciplinary team (MDT)". CTAs: "Do I qualify?", "Is this right for me?", "Check if I qualify?", "Schedule a free care call", "See how it works". Every price is immediately followed by "medication is paid separately at pharmacy cost" (`pricing.php:224`).
- Standing badges: "No judgement · No quick fixes · No blaming" (`front-page.php:786`), "Medically led · Ireland-based", "Clinically-led care".
- Human names in system copy: care coordinator Joanna (callback success text `callback-modal.js:269-271`; bubble "Hi! I'm part of the BeyondBMI care team…" `origin/feature/wp-theme:functions.php:734`).

**Trust signals (all marketed, portal-relevant).** 4.9/5 Google (`front-page.php` stats bar; JSON-LD aggregateRating 4.9/120 `reviews.html:45-51`); "3,000+ patients managed", "25+ specialists", "100% SCOPE-certified obesity medicine doctors" (`index.html:257-287, 574-587`); IMC registration + "verify each clinician on the IMC public register" (`index.html:127-133`); institutions strip UCD DCRC, St Vincent's Private Hospital, UCD School of Medicine, Imperial College London, Ulster University (`index.html:627-635`); press RTÉ, Irish Independent, Image Magazine, The Currency, Business Post (`645-652`); Irish Independent feature on Dr Harriet Treacy + HPRA warning on fake GLP-1s used as a site-wide news bar (`news-bar.js:49, 172`); "Encrypted video, EU-hosted", "Free reschedule up to 24hrs before" (`book-consultation.html:305-318`); "Our services are not intended for use in a medical emergency… call 999 or 112" and "We do not provide a general GP service" in every footer (`footer.php:37-43`). **Warning:** every review card on the site is illustrative — "Reviews shown are illustrative pending Trustpilot and Google widget integration" (`site/reviews.html:401-402`); the live homepage still shows those same six cards.

---

## 3. The product promise as marketed (live, 2026-09-11)

### 3.1 The journey — four steps (`front-page.php:287-318`; `how-it-works.php` `#steps`; live page text)
1. **Book your doctor consultation** — "Pick a time that suits you, then confirm your €89 doctor consultation. If you're not ready to book, our care coordinator is here for a free care call instead." Pill: "€89 · SCOPE-certified obesity doctor · no GP referral needed".
2. **Meet your doctor** — "€89 video consultation with an Irish-registered, SCOPE-certified obesity doctor… agree a personalised treatment plan… If prescribed, you collect medication from a pharmacy of your choice." Homepage flag: "3× longer than a standard doctor call". Length is stated as **25 minutes** (`pricing.php:151`, `faq.php:471`, `terms.php:1379`) — the older mock said 30 minutes (`site/book-consultation.html:246, 335`).
3. **Build momentum** — the 90-Day Programme: "monthly health coaching, doctor and dietitian reviews and progress tracking… most patients lose 5–10% of their body weight in these foundation months."
4. **Maintain your results** — ongoing care: "quarterly doctor reviews, monthly health coaching and nurse access, your dietitian on hand and the web app. Scale support up or down… come straight back in if life gets in the way."
Journey framing: "Nothing to pay to start… You only ever pay for the next stage when you choose to take it" (`pricing.php:122, 238-239`). Free care call = 15-minute no-obligation call with the care coordinator, after which "we'll take the next steps to book your €89 doctor consultation" (how-it-works FAQ). Older static journey (eligibility check → free care call → doctor → €150/month) survives in `site/index.html:660-695` and must not be copied.

### 3.2 Plans and prices (live copy vs. Terms)

| Stage | Marketed (pricing.php) | Terms Schedule 1 (`terms.php:1367-1581`) |
|---|---|---|
| Consultation | **€89 one-off**, "Only when you choose to go ahead"; comprehensive assessment, personalised plan, prescribing support, path to the 90-day (139-166) | Product A "€89 Assessment": 25-min video, plan, prescription if appropriate, **nurse follow-up day 5-7**, clinical messaging for 30 days, **care-coordinator contact day 21**, Web Platform access, insurance docs, prescription transmission; not included: dietitian/coach, labs, membership after day 30; no refund if no prescription; 2nd no-show = new €89 |
| 90-Day Programme | **€399 one-time** (was €450, strike-through) or **3 interest-free payments of €150 (€450)**; goal "first 5–10% weight loss"; monthly coaching, doctor & dietitian reviews, progress tracking, prescribing support (168-193) | Product B: fixed-term ≈90 days, entry = €89 assessment + clinical approval; doctor M1+M3, dietitian M1+M3 + nutrition plan, nurse M2, coach monthly, messaging, prescription mgmt, Web Platform, community, digital programme & seminars, insurance docs, **programme-end review ≈ day 80**; appointments within 7 days of milestone; instalments are not memberships; converts to Premium where agreed |
| Ongoing care | "You're enrolled after completing your 90-Day Programme"; quarterly doctor reviews, monthly nurse check-ins, dietitian & coach on demand, prescription management **with home delivery**; month-to-month, 30 days' notice; **no price shown** (195-220, 246-250) | Product C **Premium €150/month**: doctor quarterly, nurse as required, dietitian quarterly, coach monthly, prescription mgmt, digital, community, tracking. Product D **Core €75/month**: doctor quarterly, nurse, prescription mgmt, digital, community; no dietitian/coach/psychology (1491-1581) |
| Medication | Never included; pharmacy of choice at pharmacy cost, or "we can manage this for you… competitively priced pharmacy and arranging delivery straight to your door" (64, 281) | "cost of medication is not included in the Product fee" (672) |

Direct enrolment page `/90-day-programme` (noindex) sells "€399 up front — One payment, nothing further to pay" or "€150 per month — 3 monthly payments — €450 in total", and says "book your first appointment in the app once you are enrolled" (`origin/feat/applepay-and-90day:wp-theme/page-templates/90-day-programme.php:131-149`). The €89 funnel is `/book-assessment` with the widget in `data-flow="enrol"`, plan key `onboarding-89` (`book-assessment.php:91`). Payments via Stripe (`faq.html:346`); Apple/Google Pay wallets enabled in the widget (`widget.css:155-166`). Klarna pill exists only in the obsolete static two-tier block (`components.css:3428`). Insurance: itemised invoices for claims (`pricing.php:88`). Cancellation: fixed programme instalments remain due on withdrawal; ongoing care 30 days' written notice to support@beyondbmi.ie, acknowledged in 1-2 working days, office hours Mon–Fri 09:00–17:30 (`faq.html:381`; `pricing.php:96`); refunds §28 (`terms.php:903-939`).

### 3.3 Treatments as marketed (`treatment-options.php`; live text)
Four pillars: Medication (EMA-approved anti-obesity medication if clinically eligible), Medical nutrition therapy ("No fads, no banned foods"), Behavioural & psychological support, Physical activity. Medications listed: Liraglutide/Saxenda (daily GLP-1), Semaglutide/Ozempic+Wegovy (weekly GLP-1), Bupropion-Naltrexone/Mysimba (**tablet**), Tirzepatide/Mounjaro+Zepbound (weekly dual GIP/GLP-1) (`321-335`). "Most current GLP-1 and dual-hormone treatments are a once-weekly self-administered injection using a simple pen device. Your nurse shows you exactly how" (66-69); "We don't do one-off prescriptions or sell medication on its own" (98-101); maintenance dosing after goal weight (106-109). Live announcement bar since 2026-09-08: **"Oral weight-loss support now available · Check availability →"** (commit `9dd2209`; screenshot) — the oral pathway (Mysimba; `results.php:262` also mentions orlistat) is now a marketed option. Eligibility: BMI ≥30, or ≥27 with a weight-related condition; exclusions T1D, under 18, pregnancy/planning/breastfeeding, end-stage kidney/liver disease, pancreatitis not due to gallstones, not resident in ROI (`front-page.php` FAQ; `faq.html:259-271`). Blood tests within one month of starting: HbA1c, liver panel, TFTs, renal panel (lipids optional) (`faq.html:332`). Explainer videos hosted on YouTube (`treatment-options.html:258, 273, 321, 360`).

### 3.4 Outcome claims the portal will be measured against
"Lose up to 21.5% of your body weight over 12 to 18 months" (`front-page.php:190`); "Most patients lose 10–20% of their body weight over 12–18 months" (`results.php:133`); "5–10% in the foundation months" (`pricing.php:173`); homepage chart "With BeyondBMI vs Diet & exercise alone", footnote "Illustrative of the trajectory most patients see"; four non-scale outcomes: healthier markers, quieter cravings, more energy/better sleep, "feeling like you again" (`front-page.php:382-397`); citations to SURMOUNT-3 and STEP-3 (`index.html:432-434`). The eligibility popup projects "up to 20kg in 10 months" with a mandatory "clinical-trial average, not a promise" caveat (`main.js:894-912`, `CHANGELOG:270-278`). Portal weight-tracking UI should present outcomes in the same "health gain over numbers" register.

### 3.5 Care team as marketed (`team.php:127-258`; live `/team`)
Medical: Dr Harriet Treacy (Medical Doctor · Founder), Prof Carel le Roux (World-Leading Obesity Physician), Prof Alex Miras (Professor & Consultant in Endocrinology), Dr Alvin Mondoh (Obesity Medicine Expert), Dr Uzair Shabbir (GP Specialist in Lifestyle & Obesity Medicine), Dr Emma O'Hara (GP Consultant), Joanna Bridgett (Senior Care Coordinator). Dietetics, Nursing & Coaching: Dr Werd Al-Najim (Head of Dietetics), Francisca Contreras (Clinical Dietitian · Specialist in Obesity Management), Anna Galvin (Clinical Support Nurse), Isolde Glynn (Health Coach), Paul Juggins (Senior Health Coach). Behind the scenes: Karl Flanagan (CCO), Monika Szmer (Customer Success), Alejandro Hidalgo Matellano (Marketing). Psychologists are promised in copy ("dietitians, nurses, health coaches and psychologists", `index.html:564-566`) but none is named; the Terms make psychology an external referral on Core (`terms.php:1578`). Individual profile pages exist at `/team/<slug>` (15 templates, `inc/team-pages-data.php`) with a navy banner + overlapping intro card design (`components.css:6591-6700`) — a good precedent for the portal's "your care team" cards.

---

## 4. Navigation, footer and legal surfaces the portal should link to

**Live primary nav** (drawer, `main.js:294-450`; header `origin/feature/wp-theme:wp-theme/header.php:33-64`): Home; Our Programme → Weight Loss `/adult-weight-loss`, Treatment options `/treatment-options`, How it works `/how-it-works`; Resources → Blog `/blog`, Webinars `/webinars`, FAQ `/faq`, News & media `/news-and-media`; About → Our team `/team`, Reviews `/reviews`, Careers `/careers`, Contact `/contact`; drawer footer CTA → qualify. Header right: "Talk to Care-Coordinator Team" (`tel:+35319038441`) and **Log In → `https://app.beyondbmi.ie/login`** (the portal's entry point; the marketing site will need this URL swapped when the new portal launches).

**Live footer** (`footer.php`): "Have a question?" → support@beyondbmi.ie ("We aim to reply in 24hrs"); "Ready to get started? … book your €89 doctor consultation" → `/qualify`; columns Programmes (Weight Loss, Treatment options, How it works, **Pricing** `/pricing`), Resources (Blog, Webinars, FAQ, News & media), About (Our team, Reviews, Contact, **Member log in** → `app.beyondbmi.ie/login`); socials Instagram `beyond_bmi`, X `beyondbmi`, Facebook `BeyondBMI`, LinkedIn `company/beyondbmi`; "© 2026 BeyondBMI", "Nova UCD, Belfield Innovation Park, Dublin D04 V2P1"; legal **Privacy `/privacy/` and Terms `/terms/` only** (91-97); mobile fixed call button (103-105). Older static footers also linked "The app" (`site/app.html`, exists on `origin/main` only) and `/cancellation-policy` (now 301 → `/terms`, `inc/redirects-data.php:33-36`).

**Legal pages (deployed templates).** `/terms/` = "BeyondBMI Membership and Clinical Services Terms", effective July 2026, Privamed Limited CRO 721679, registered office Unit 6E Nutgrove Office Park, Rathfarnham, Dublin 14 (`terms.php:25-51`); anchors used by marketing: `#s26` Cancelling, `#s28` Refunds, `#schedule-1` Product Schedules, `#schedule-3` Cancellation & Refund Policy (`pricing.php:297, 301`). `/privacy/` = "Privacy Policy", effective 27 July 2026 (`privacy.php:27-29`). Also templated but not footer-linked: `customer-terms.php` "Website Customer Terms of Use" and `website-terms.php` "Website Terms of Use" (registered office given there as Nova UCD — inconsistent with terms.php). The Terms say appointments "must be booked through the Platform" and clinical care is "delivered exclusively as a telemedicine service" (`terms.php` Schedule 2 §1; `website-terms.php:105`). Portal footer minimum: Privacy, Terms (+ deep links to §26/§28/Schedule 1-3), Contact/support email + phone, emergency disclaimer, "not a GP service" line, company identity (Privamed Ltd t/a BeyondBMI, CRO 721679).

---

## 5. What the old app looked like (marketing renders)

Only two renders exist: `R/site/assets/img/app/welcome-phone.webp` (800×800) and `weight-tracker-phone.webp` (800×533); both are hand-held iPhone mockups on a grey studio backdrop, used in the bento tile "Convenient, fully remote access to your care team" (`index.html:390-398`, now captioned "the included BeyondBMI **web app**" on the live site).

- **Welcome/login**: full-bleed photo of a smiling red-haired woman in a yellow jumper holding a phone, teal-blue→olive gradient overlay; a rounded-square app icon in a bright cyan-blue with the white ring mark; wordmark "Beyondbmi"; headline "Welcome to Beyondbmi", sub "Begin with your biology"; a full-width **Login** button in a brighter cyan-blue than the site's `#65A1BC` [INFERRED from render]; "Haven't signed up? **Join now**" (link in the same blue). Rounded ~12px corners; white sans-serif (Poppins-like).
- **Weight Tracker**: white screen with a pale-blue header band (≈`--bb-blue-soft`) titled "Weight Tracker", small ring logo top-left, "⋮" top-right; two KPIs "% Weight Change ↓ -8%" and "Total Weight Change ↓ -10 kg" in green; card "Weight tracker" with "CURRENT WEIGHT 90 kg", a lime (`#A5DB73`-like) line chart May→27 Aug 2023 on a 50-100 kg axis; helper "Our recommendation is to weigh yourself once a week."; full-width "Add New Weight" button with a pale blue→pale green horizontal gradient and navy text; "Weight Log" table with pale-blue month header rows (August, July) and "EDIT" links; a five-item bottom tab bar **Appointments · Rx · Tracker · 1:1 Chat · Community** (label rendered "1C Chat" in the mockup — 1:1 chat [INFERRED]) with the active tab in blue.
- Read-across: the old IA was appointments, prescriptions, tracker, coach chat, community. Its palette already matched the brand tokens (blue-soft surfaces, lime data line, navy text) but with brighter accent blues than v3. The marketing site's page for it (`site/app.html`) has been retired from the live nav in favour of `/pricing`.

---

## 6. Recommendation — a premium clinical product that is still unmistakably BeyondBMI

**Keep (the brand atoms).** Poppins (400/500/600; reserve 700 for numbers and page titles); navy ink `#053F5C` / ink-soft `#2B5165` / muted `#5C6F77`; white cards on `#F5F9FB`; `#E2E8E5` hairlines; clinical blue for *interactive and selected* states (`--bb-blue-soft` fills, `--bb-blue` borders/selected day, `--bb-blue-text` links) exactly as the booking calendar and stepper already do; lime `#A5DB73` as the **single** "progress/positive" colour (weight-down deltas, completed steps, the chart line — as in the old tracker); Feather stroke icons at 1.75–2px; `--ease-out` 180/320ms with no bounce; the entitlement-list pattern (`.bb-incl-*`: label + "when" chip + one-line description) for "what's in your plan"; the stepper pills, calendar and time-slot components; the navy-banner + overlapping-card profile pattern for clinicians; the price-card anatomy (badge, name, price, goal line, benefit accordion) for plan/upgrade screens.

**Drop (the marketing scale).** `clamp(…4.2rem)` display type and 800 weights; `--r-xl/--r-2xl` (28/36px) and pill-everything; hover `translateY` lifts and `0 24px 60px` floating shadows on content cards; the peach/cream/mint bento tints and blob-gradient CTA sections; marquees, autoplay video, Ken-Burns imagery; auto-opening popups (news bar, callback, BMI projection); ribbons/"Start here" stickers, Klarna pink; uppercase-tracked eyebrows on every block; illustrative review quotes and any "Lose up to 21.5%" style claims inside the product.

**Portal token proposal (mapped from brand tokens; new names to avoid collisions with the marketing sheet).**

```css
/* surfaces */ --p-canvas:#F5F9FB; --p-surface:#FFFFFF; --p-surface-2:#E6EFF4; --p-border:#E2E8E5; --p-border-soft:#F0F2F4;
/* chrome   */ --p-chrome:#053F5C; --p-chrome-2:#0A4D70; --p-on-chrome:#F2F4F4; --p-on-chrome-muted:#94B1BF;
/* text     */ --p-ink:#053F5C; --p-ink-2:#2B5165; --p-muted:#5C6F77;
/* action   */ --p-primary:#053F5C (hover #032E45)  /* AA 11:1 */;  --p-link:#225A75;  --p-focus:#65A1BC (2px ring + 3px offset);
/* selected */ --p-selected-bg:#E6EFF4; --p-selected-border:#65A1BC; --p-selected-fill:#65A1BC (icons/day cells, never body text);
/* status   */ --p-positive-text:#266314; --p-positive-bg:#DCEFCC; --p-positive-line:#A5DB73;  --p-warn-text:#B34433; --p-warn-bg:#FBEEEC; --p-notice-bg:#FFF8E6; --p-notice-border:#F0D48A;
/* shape    */ --p-r-sm:8px; --p-r-md:12px; --p-r-lg:16px; --p-r-pill:999px;  --p-shadow-1:0 1px 2px rgba(5,63,92,.06); --p-shadow-2:0 6px 24px rgba(5,63,92,.06);
/* type     */ body .9375rem/1.5 Poppins 400; h1 1.5rem/1.2 600 -.02em; h2 1.25rem 600; h3 1.0625rem 600; label .8125rem 600; meta .75rem; numbers tabular-nums;
/* motion   */ 180ms/320ms cubic-bezier(.16,1,.3,1); reduced-motion honoured.
```

**Shell.** Navy chrome (top bar on mobile, 240–260px left rail on ≥1024px) carrying the white ring mark + "BeyondBMI"; content on `--p-canvas` at max 1200px; a right-hand "context rail" for next appointment / care team / plan status on wide screens. Mobile bottom tab bar mirroring the old IA so returning members are not lost: Home · Appointments · Prescriptions · Progress · Messages (community only if it survives the Semble move). Primary button = navy filled pill 44px; secondary = white with `--p-border`; tertiary = `--p-link` text with `→`. Lime never carries text; it carries the sparkline, the "↓ -8%" delta chip and completed-step ticks. Dark navy sections only as chrome, never as content backgrounds (no dark theme — the brand has no dark palette beyond the footer/banner).

**Voice inside the product.** Same rules as §2: calm, plain, second person, no exclamation marks, no sales; state the entitlement and the rule together ("Doctor review · Month 3 — book by 12 Nov · 24 hours' notice to reschedule"); use the marketed names exactly (€89 doctor consultation, 90-Day Programme, Ongoing care/Premium/Core once Art decides the member-facing labels); keep "medication is paid at pharmacy cost" adjacent to any prescription UI; surface clinician role + "IMC-registered · SCOPE-certified" on every appointment.

---

## Implications for the portal (must-have / must-not / decisions)

**Must-have**
- Plan-aware entitlement ledger with counters and windows (doctor M1/M3, dietitian M1/M3, nurse M2, coach monthly, day-80 review; Premium quarterly/monthly; Core medical-only) — the Terms promise it and say booking happens "through the Platform" (`terms.php:1367-1640`).
- Booking UI that enforces the 24-hour reschedule rule, records no-shows, and shows the €89 first-no-show free reschedule (Schedule 2 §4-8).
- Prescription surface consistent with "collect at your pharmacy or we arrange delivery" and "renewals managed by your doctor" (`treatment-options.php:74-77`), including the new oral pathway.
- Progress tracking (weight + health markers) in the "health gain" register, with lime as the data colour and the once-a-week weigh-in nudge the old app used.
- Care-team screen with role, credentials, SCOPE/IMC lines and the care coordinator as a named human (Joanna) with phone `+353 1 903 8441` and support@beyondbmi.ie.
- Insurance documentation/itemised invoices per product (`pricing.php:88`; Schedule 1).
- Footer/legal: Privacy, Terms (+ §26/§28/Schedule anchors), emergency + "not a GP service" disclaimers, Privamed Ltd identity.
- AA-compliant primary action colour; `prefers-reduced-motion` support; focus ring visible on white.

**Must-not**
- Do not reuse `.btn-primary` blue/green with white text (fails AA) or the marketing display scale/radii/hover-lift.
- Do not import review quotes, outcome percentages or "up to 21.5%" claims into member screens.
- Do not use peach/cream/mint tints, blob gradients, marquee, autoplay video or auto-popups.
- Do not describe the ongoing tier as "€150/month membership" to new members (legacy wording) — the live ladder is €89 → €399/3×€150 → ongoing care (Premium €150 / Core €75).
- Do not present a "free care call → app sign-up" journey; the app is joined after payment ("book your first appointment in the app once you are enrolled").

**Decisions needed (Art)**
1. Primary button colour for the portal: navy (recommended) vs. brand blue vs. the deployed green.
2. Member-facing names for Product C/D: "Ongoing care" (marketing) vs "Premium"/"Core" (Terms), and how the 150 legacy €150/month members are labelled.
3. Brand-name casing and lockup in the app: "Beyondbmi / Begin with Biology" wordmark vs "BeyondBMI" copy; need a vector logo (only WebP exists).
4. Whether community and 1:1 coach chat survive the Semble move (both are promised in the live Schedule 1 and the old tab bar).
5. Consultation length shown in the portal: 25 min (live) vs 30 min (older mock).

---

## Open questions

- Where are the client's Content Guideline and Social Media Content Pillars PDFs? Only their summary exists in `CHANGELOG-feedback-2026-05-06.md:198-215`; the portal copy deck should cite the originals.
- Vector brand assets (SVG logo, icon, colour spec) — none in the repo; who holds them?
- Which WP.com branch is configured for deployment? Evidence points to `origin/feature/wp-theme` (carries all live copy), but `wp-theme/README.md:11` only says "configured in WP.com". `origin/vercel` (staging) diverges from it.
- "Oral weight-loss support now available" (bar since 2026-09-08): which product/price does it map to, and does it change the €89 → 90-day ladder for oral-only patients?
- Registered office mismatch: Terms say Nutgrove Office Park, Rathfarnham; Website terms/footer say Nova UCD. Which is correct for the portal's legal footer?
- Real Google reviews: when does the live widget replace the illustrative cards, and may the portal show any of them?
- Are psychology appointments actually bookable (marketed on the team copy, excluded on Core in the Terms)?
- Does "Web Platform access during the Product period" (Schedule 1) mean the portal must lock out members after day 30 of the €89 product if they do not continue — and what does the lapsed state look like on-brand?
- `home-ui-refresh.css` (deployed, 2026-09-10) is described as "approved homepage UI"; is there a Figma/staging source for those approvals that should also govern the portal?
