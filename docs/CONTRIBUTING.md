# Contributing

## Commands

```bash
npm install
npm run dev              # vite on 0.0.0.0:5173
npm run lint             # oxlint — must be clean
npm run test             # vitest (unit + component + hook tests)
npm run test:coverage    # same, with enforced thresholds — must pass
npm run build            # tsc -b + vite build — must be green
pytest scripts/ -q       # Python smoke tests (needs scripts/requirements-dev.txt)
```

Keep all of these green before pushing. CI (`.github/workflows/ci.yml`)
runs lint + test + coverage + build plus a separate pytest job.

## Coverage rule

Thresholds live in `vite.config.ts` (`lines/functions/statements ≥90`,
`branches ≥85`) and are enforced by `npm run test:coverage`:

- New/changed code in `src/core/pdf.ts`, `src/core/canvas.ts`,
  `src/core/assets.ts` is expected at **100%** — these sit directly on the
  PDF output path (`pdf.ts` is fully mocked-engine tested).
- The `renderPageCanvas` engine bodies need a real browser paint (hidden
  iframe + `html-to-image`); they are tested as orchestration with mocked
  engines in `src/core/raster.test.ts`, and pixels are verified through
  `scripts/verify.sh` instead of jsdom.
- `*.test.ts` colocate with the module; component tests are `*.test.tsx`
  via Testing Library (`vitest.setup.ts` loads `jest-dom`); hook tests live
  next to their hook in `src/ui/`.

## Conventions

- Business logic stays pure in `src/core/` (no React/DOM except the raster
  and measurement passes); components stay in `src/components/`
  (Atomic Design); workflow state lives in `src/ui/` hooks.
- Every component needs a showcase file under `src/showcases/` registered
  in `src/showcases/index.ts` (see README “Showcases”).
- Every `src/core` export carries JSDoc.
- Python scripts share `scripts/inline_lib.py` (the twin of
  `src/core/embed.ts`) — don't copy-paste basename logic; add
  `pytest` cases in `scripts/test_scripts.py` for script changes.
