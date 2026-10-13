# Space access repair plan

**Goal:** Diagnose the deployed Supabase connection and stop database failures from being reported as invalid invitation codes.

**Scope:** Keep the existing nickname/invitation/session flow. Preserve all local and cloud data. Cloud recovery requires the deployed error code or the read-only Supabase setup report; the local environment does not contain production credentials.

- [x] Add failing API regression cases for missing database functions, invalid server configuration, and genuine invalid invitations.
- [x] Catch creation/join failures and return a service error for infrastructure failures; retain invalid-invite and nickname-conflict responses for their specific database errors.
- [x] Add a build-time configuration check that refuses local persistence on Vercel and reports missing server variables without printing values. Load `.env*` with Next's own environment loader.
- [x] Prepare read-only Supabase SQL diagnostics and precise recovery instructions for project `khvpwwwaxitejdqlkoia`.
- [x] Run targeted regression tests, the existing suite, lint, type checking, and a production build. Review the diff.
- [x] User confirmed production is working on 2026-10-13. No cloud database changes or code deployment were performed by this session; no further cloud recovery is needed. Local changes remain uncommitted and unpushed.
