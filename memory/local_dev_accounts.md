---
name: local-dev-accounts
description: Local development account credentials for Tullamore
metadata:
  type: project
---

Admin account inserted into local D1 on 2026-06-26:

- Email: info@alcogy.com
- Password: password
- Permission: admin
- UUID: 26ed8166-42a0-471e-a3e0-d46d97f84da7

Login at http://localhost:8787/signin

**Why:** All routes require login; no signup screen exists. Admin account must be manually inserted.
**How to apply:** Use these credentials for local testing. For new local DB setup, re-insert via `bunx wrangler d1 execute tullamore --local --command "INSERT INTO accounts..."` with a freshly generated password hash.
