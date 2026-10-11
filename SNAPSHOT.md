# Snapshot note

`src/worker.src.mjs` was re-copied on 2026-10-11 at 13:17 CT from the private AI Video Atlas project (`worker/src.mjs`). It matches the Worker deployed at 18:15 UTC (1:15 PM CT): the get_guide tool and guide resources, the plan_shots fixes (framing context, clean adapted prompts, per-shot consistency, mode-matched alternatives, promo expiry), and anonymous daily counters in the Durable Object with `GET /stats/daily`.
The private project isn't a git repo, so there's no commit hash. The source fingerprint is:

sha256 496f4ff5bb90834c297ab6231059fd2cd14731bd2f3a3e73c9d0c954863be9d0  src/worker.src.mjs

The bundled data (`__DATA__`, built from the site) is not included. Re-sync before publishing if the live Worker has changed.
