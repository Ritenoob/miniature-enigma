# Quick Reference: Manual Actions Required

## 🚨 Immediate Actions Needed

Due to GitHub API limitations, these actions must be completed manually via the GitHub web interface.

---

## Step 1: Update PR #14 Description

**URL**: https://github.com/Ritenoob/miniature-enigma/pull/14

**Action**: Click "Edit" on the PR description and replace with:

```markdown
## V3.6.1-alpha: Foundation Release

### Changes
- `.github/copilot-instructions.md` - Architecture, formulas, coding patterns
- `.github/CONTRIBUTING.md` - Development workflow, testing guidelines  
- Version updates: `v3.4.x` → `v3.5.0+` in README and signal-weights comments
- `docs/V3.6.1_STATUS.md` - Integration status and roadmap
- `docs/V3.6.1_RELEASE_PLAN.md` - Release planning documentation
- `CHANGELOG.md` - Version history

### Cleanup Applied
- ✅ Removed Python MACD strategy files (eth_macd_strategy.py, tests/test_strategy.py, requirements.txt)
- ✅ Cleaned .env.example (removed Python config vars)
- ✅ Cleaned .gitignore (removed Python entries)
- ✅ Updated CHANGELOG.md (removed Python references)

### Integration Status
- ✅ PR #1: Copilot instructions
- ✅ PR #9: Version consistency
- 📋 Next: PR #6 (StopReplaceCoordinator), PR #8 (PingBudgetManager)
```

---

## Step 2: Update PR #14 Title

**Current**: (whatever it is now)  
**New Title**: `V3.6.1-alpha: Foundation (Documentation + Version Cleanup)`

---

## Step 3: Mark PR #14 Ready for Review

If the PR is marked as "Draft", click "Ready for review" button.

---

## Step 4: Merge PR #14

1. Click "Squash and merge" button
2. Use commit message: `Release v3.6.1-alpha: Foundation (documentation + version cleanup)`
3. Confirm merge

---

## Step 5: Proceed with Phase 2

After PR #14 is merged, you can either:

### Option A: Request Copilot to Complete Phase 2
Tell Copilot: "PR #14 is now merged. Please proceed with Phase 2 of the V3.6.1 release plan."

### Option B: Manual Phase 2 Execution

```bash
# 1. Create feature branch
git checkout main
git pull origin main
git checkout -b release/v3.6.1-features

# 2. Merge PR #6 (StopReplaceCoordinator)
git fetch origin copilot/implement-risk-exit-engine
git merge copilot/implement-risk-exit-engine --no-ff
# Resolve any conflicts

# 3. Merge PR #8 (PingBudgetManager)
git fetch origin copilot/add-ping-budget-manager
git merge copilot/add-ping-budget-manager --no-ff
# Resolve any conflicts in signal-weights.js

# 4. Update version to 3.6.1
# Edit: package.json, server.js, index.html, README.md, CHANGELOG.md

# 5. Test
npm test
DEMO_MODE=true npm start

# 6. Push and create PR
git push origin release/v3.6.1-features
# Then create PR via GitHub web UI
```

---

## Step 6: Handle Documentation PR

The documentation files are currently in PR #18 (copilot/clean-and-merge-v3-6-1-alpha).

### Option A: Keep in PR #18 (Simplest)
- Review and merge PR #18 as-is
- It contains both Phase 1 cleanup and Phase 3 documentation

### Option B: Create Separate Documentation PR
```bash
git checkout main
git pull origin main
git checkout -b docs/live-optimizer-prompts
git checkout copilot/clean-and-merge-v3-6-1-alpha -- docs/prompts/
git add docs/prompts/
git commit -m "Add Live Optimizer System implementation prompts"
git push origin docs/live-optimizer-prompts
# Create PR via GitHub web UI
```

---

## What Was Already Done

✅ **Phase 1 (Automated)**:
- Python files removed from copilot/release-v361 branch
- Config files cleaned (.env.example, .gitignore)
- CHANGELOG.md updated
- Commit c4323e3 pushed to copilot/release-v361

✅ **Phase 3 (Automated)**:
- Created docs/prompts/ directory
- Created 10 comprehensive documentation files (~100KB total)
- All files pushed to copilot/clean-and-merge-v3-6-1-alpha branch

⏸️ **Phase 2 (Blocked)**:
- Waiting for PR #14 merge
- All steps documented in IMPLEMENTATION_STATUS.md

---

## Files to Review

- `IMPLEMENTATION_STATUS.md` - Complete task breakdown
- `docs/prompts/README.md` - Overview of Live Optimizer system
- `docs/prompts/01-09-*.md` - 9 detailed implementation guides

---

## Questions?

If anything is unclear, check:
1. `IMPLEMENTATION_STATUS.md` for detailed task breakdown
2. Original problem statement for context
3. Individual prompt files in `docs/prompts/` for implementation details

---

**Last Updated**: 2026-01-02  
**Branch**: copilot/clean-and-merge-v3-6-1-alpha  
**Status**: Phase 1 & 3 complete, Phase 2 blocked on PR #14 merge
