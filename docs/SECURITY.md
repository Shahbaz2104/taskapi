# Security Notice — Credential Exposure Remediation

> **Date:** 2026-08-25
> **Status:** `.env` untracked as of this commit. Secrets remain in git history.

## What happened

A live `.env` file containing a MongoDB Atlas connection string (with embedded
username/password) and the `JWT_SECRET` was committed early in this repository's
life and remained tracked through later history. See `AUDIT.md` FIND-001.

Untracking the file stops *future* changes from being committed, but the secret
values remain recoverable from earlier commits.

## Required manual actions

1. **Rotate the MongoDB Atlas password** for the exposed database user.
   Atlas → Database Access → Edit user → Edit Password.
2. **Generate a new `JWT_SECRET`** locally:
   ```bash
   openssl rand -base64 48
   ```
   Update your local `.env`. Any previously issued access tokens signed with
   the old secret stop validating immediately after restart — expected.
3. Keep the repository **private** until step 3 below is complete.

## Purging secrets from git history (before making the repo public)

```bash
# Recommended: git-filter-repo (fast, safe)
pip install git-filter-repo
git filter-repo --path .env --invert-paths

# Force-push the rewritten history
git push origin --force --all
```

Notes:

- `filter-repo` rewrites commit hashes; collaborators must re-clone.
- Consider squashing into a fresh initial commit instead if history value is low.
- Verify afterwards: `git log --all --full-history -- .env` returns nothing.
- Rotation (steps above) is mandatory regardless — assume any pushed secret is
  compromised even after purge.

## Prevention

`.gitignore` already lists `.env`. When adding new environment files, verify
with `git ls-files | grep -c "^\.env"` (should print `0`).
