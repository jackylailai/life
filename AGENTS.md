# AGENTS.md

Instructions for AI coding agents working on this repository. Read before editing.

## 1. What this is

A personal life log — slow channel. Journal entries, photo captions, a "now"
section, a short about. Separate repo from the portfolio (see
https://github.com/jackylailai/profolio). Same authoring pattern, **different
design language**.

## 2. Layout

```
index.html              — template; copy is hydrated at runtime
content/
  content.json          — all page copy, edit this for wording changes
  render.js             — fetches content.json, fills placeholders, then loads script.js
styles.css              — design tokens + all visual rules
script.js               — vanilla JS: smooth-scroll, soft fade-in observer
scripts/smoke.mjs       — Playwright visual smoke test
.github/workflows/smoke.yml — post-deploy smoke workflow
```

Renderer directives (same vocabulary as the portfolio repo): `data-copy`,
`data-text`, `data-attr`, `data-list` + `data-item-template`, `data-bind`,
`data-bind-text`, `data-bind-html`, `data-bind-attr`, `data-class-from`,
`data-if`. Markdown subset in any string: `**bold**`, `*italic*`,
`==accent==`, `\n`. Token `{year}` interpolates.

No build step, no framework, no bundler. Vanilla only. Google Fonts is the
only external dependency; do not add CDN script libraries unless they
materially serve the journal/calm aesthetic.

## 3. Design direction — warm paper, serif, journal calm

Deliberately not the portfolio's dark-futuristic language. This site should
feel like a thoughtful zine or a slow magazine column.

### Palette
- Background: warm cream / off-white paper (`#f7f1e6`). Avoid pure white.
- Surfaces: a slightly deeper paper for alternating blocks.
- Ink: deep warm black (`#1f1a14`) for body, muted brown-gray for secondary.
- Accent: one terracotta (`#b34a2a`). A muted olive (`#6d7656`) is allowed
  for kicker / monospace metadata.

### Typography
- Display headings: **Fraunces** (variable serif), light/regular weights,
  tight tracking on large sizes. Italic Fraunces for leads and intros.
- Body: Inter (or system sans), 1.65 line-height.
- Kicker / metadata / dates: **JetBrains Mono**, uppercase, wide tracking.

### Tone
- Generous whitespace. Long pauses between blocks. Vertical padding ≥ 96px
  desktop.
- Animation is whisper-soft: a single fade + 8px translate on block entry.
  No parallax, no particles, no neon glow.
- Always honour `prefers-reduced-motion: reduce`.

### Content authoring tone
- First-person, low-key, traditional Chinese (zh-Hant) by default. Mixed
  English is fine for monospace labels.
- Avoid corporate / résumé voice. This is the opposite of the portfolio.

## 4. Authoring rules — what NOT to put in this repo

This site is public. Every commit ships to GitHub Pages.

- No employer-internal references, project codenames, salaries, customer
  data, or anything an NDA covers.
- No secrets, API keys, tokens, internal URLs, `.env` files.
- No personal data of other people without their consent (names, faces,
  exact home / workplace locations).
- Photos: keep EXIF in mind — strip GPS before publishing.

## 5. Local preview + deploy

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Deploy: Pages source is the **`pages-release`** branch. Merge `main` →
`pages-release` (fast-forward when possible) and push.

After deploy, `.github/workflows/smoke.yml` runs Playwright against the
live URL. A failure opens an issue tagged `smoke-failure`.

## 6. Silent blank-page failure mode

`render.js` removes the `is-loading` class only after it successfully fills
the page. If `render.js` or `script.js` throws, `body.is-loading` keeps
`opacity: 0` and the page looks blank to humans — but `view-source` shows
populated HTML and will lie to you.

Guards:
1. Any DOM query in `script.js` used without `?.` must target an element
   that absolutely exists.
2. Run the smoke test before pushing to `pages-release`.
3. Do not trust `curl | grep` for visual regressions. Use a real browser.

## 7. When in doubt

Ask the owner before:
- Adding a new external dependency.
- Changing the accent colour or display font.
- Adding tracking / analytics of any kind.
- Publishing identifiable photos of other people.
