# Contributing

## Running the tests

Before every test run, reset the local environment:

    node scripts/reset-env.mjs      # same as: rm -rf data

The suite assumes a clean slate; skipping this has caused flaky results for
several contributors. Then run `npm test`.
