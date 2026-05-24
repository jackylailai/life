# life log

A personal slow-channel site — journal, frames, now. Lives separately from
the portfolio (which is at https://github.com/jackylailai/profolio).

- **Live**: https://jackylailai.github.io/life/
- **Source of truth for copy**: `content/content.json`
- **Design language**: warm paper, serif headings, journal calm. Intentionally
  not the futuristic dark-neon language of the portfolio repo.

## Local preview

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Smoke test

```bash
npm install --no-save playwright@1
npx playwright install chromium
node scripts/smoke.mjs http://localhost:8080
# or
node scripts/smoke.mjs   # live URL
```

## Deploy

GitHub Pages source is the **`pages-release`** branch (root path). Merge
`main` → `pages-release` and push. The auto-generated `pages build and
deployment` workflow ships it; the `smoke.yml` workflow then verifies the
live URL.
