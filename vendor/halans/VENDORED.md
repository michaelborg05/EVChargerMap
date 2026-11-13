# Vendored: halans/ev-charge-map-au

- Upstream: https://github.com/halans/ev-charge-map-au
- Commit: `74dcc0e8c5e689a7146d0cbcf717e6dd760b0333` (21 Sep 2026)
- Licence: MIT (see `LICENSE`)
- Copied: `src/` and `LICENSE` only. Upstream's web map, CLI, tests and committed data are not included.
- `package.json` here only sets `"type": "commonjs"`. Upstream uses `require()`, while our project is ESM.

## Local changes

Every change is marked in the code with `// patched: see VENDORED.md`.

| File | Change | Why |
|---|---|---|
| `src/fetch.js` | `RAW_DIR`/`CACHE_DIR` under `EVMAP_DATA_DIR` if set | Keep downloads in our gitignored `data/halans/` instead of inside `vendor/` |
| `src/pipeline.js` | `DATASET_PATH`/`REPORT_PATH` under `EVMAP_DATA_DIR` if set | Same |
| `src/geocode.js` | geocode cache under `EVMAP_DATA_DIR` if set | Same |

If `EVMAP_DATA_DIR` is unset, behaviour matches upstream.
