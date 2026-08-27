# Security Notice — Credential Exposure Remediation

> **Date:** 2026-08-25
> **Status:** ✅ **RESOLVED 2026-08-27** — Atlas password + `JWT_SECRET` rotated, `.env` and `client/e2e/.auth/user.json` purged from all history via `git filter-repo`, history force-pushed. Repository is export-ready (previous state preserved below).

## ⚠️ RESOLVED — do not skip reading

On 2026-08-27 the exposure was fully remediated:

1. **Rotated both secrets** — Atlas user password changed in Atlas → Database
   Access; new `JWT_SECRET` generated (`openssl rand -base64 48`) and written
   to local `.env`.
2. **Purged history** with `git filter-repo`:
   ```bash
   git clone --mirror . /tmp/taskapi-mirror
   cd /tmp/taskapi-mirror
   git filter-repo --path .env --path client/e2e/.auth/user.json --invert-paths
   git remote add origin <repo-url>
   git push origin --force --all
   ```
3. **Verified** `git log --all --full-history -- .env` and
   `-- client/e2e/.auth/user.json` return nothing; only `.env.example` ships.
4. Collaborators must **re-clone** (all commit hashes were rewritten).

### Before the incident (record for context)

A live `.env` file containing a MongoDB Atlas connection string (with embedded
username/password) and the `JWT_SECRET` was committed early in this repository's
life and remained tracked through later history. See `AUDIT.md` FIND-001.
Untracking the file stops _future_ changes from being committed, but the secret
values remained recoverable from earlier commits.

### Original required manual actions

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
with `git ls-files | grep -c "^\.env$"` (must print `0`; allowlisted
`.env.example` is the only tracked `.env*`).
