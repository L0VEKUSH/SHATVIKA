# TODO

## GitHub first push hardening checklist

- [x] Inspect code for env var usage / potential secrets (lib/env.ts, adminJwt*, middleware)
- [x] Create `.env.example` with placeholders
- [ ] Update `.gitignore` to production-ready baseline
- [ ] Run security audit: confirm no `.env*` / keys / secrets are present or tracked
- [ ] If build artifacts / node_modules are tracked: remove from git index (git rm --cached)
- [ ] Verify `git status` shows no sensitive files staged
- [ ] Create clean initial commit
- [ ] Final verification + security report (ignored files, removed tracking, secrets found, git status, score)

