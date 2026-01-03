# 🔒 Security Scanning Documentation

This document explains the security scanning architecture for the KuCoin Futures Dashboard and provides setup instructions.

## Table of Contents

- [Overview](#overview)
- [Why Advanced Setup?](#why-advanced-setup)
- [Architecture](#architecture)
- [First-Time Setup](#first-time-setup)
- [Validation & Monitoring](#validation--monitoring)
- [Configuration Details](#configuration-details)

---

## Overview

This repository uses **CodeQL Advanced Setup** for automated security scanning. CodeQL analyzes the codebase to detect:

- Security vulnerabilities (SQL injection, XSS, etc.)
- Code quality issues
- Common coding errors
- Potential bugs and anti-patterns

### Key Features

- **Languages Scanned:** JavaScript/TypeScript, GitHub Actions workflows
- **Scan Frequency:** On push, pull requests, and weekly schedule
- **Integration:** Results appear in GitHub Security tab
- **Zero Configuration:** Works out of the box after proper setup

---

## Why Advanced Setup?

We chose **Advanced Setup** over **Default Setup** for several reasons:

### Advanced Setup Benefits

| Feature | Advanced Setup | Default Setup |
|---------|---------------|---------------|
| **Custom Queries** | ✅ Supported | ❌ Limited |
| **Build Customization** | ✅ Full control | ❌ Automatic only |
| **Multi-language Control** | ✅ Per-language config | ❌ All or nothing |
| **Workflow Integration** | ✅ CI/CD integration | ❌ Separate process |
| **Version Control** | ✅ In repository | ❌ GitHub-managed |

### Our Use Case

1. **Custom Build Steps:** We may need specific Node.js setup or dependencies
2. **Workflow Integration:** CodeQL runs alongside CI tests
3. **Transparency:** Configuration is version-controlled and reviewable
4. **Flexibility:** Can add custom queries or analysis configs later

### Trade-offs

**Advanced Setup:**
- ✅ More control and flexibility
- ✅ Configuration in version control
- ❌ Requires manual setup
- ❌ Must maintain workflow file

**Default Setup:**
- ✅ Easier initial setup
- ✅ Managed by GitHub
- ❌ Less flexibility
- ❌ Cannot coexist with advanced setup

---

## Architecture

### Workflow Configuration

The security scanning is defined in `.github/workflows/codeql.yml`:

```yaml
name: "CodeQL Advanced"

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]
  schedule:
    - cron: '29 4 * * 5'  # Weekly, Fridays at 4:29 AM UTC
```

### Scan Matrix

We scan multiple languages in parallel:

```yaml
matrix:
  include:
    - language: actions
      build-mode: none
    - language: javascript-typescript
      build-mode: none
```

**Languages:**
- **actions:** GitHub Actions workflow files (`.github/workflows/*.yml`)
- **javascript-typescript:** JavaScript and TypeScript files

**Build Mode:**
- **none:** No compilation needed (interpreted languages)

### Workflow Steps

1. **Checkout:** Clone the repository
2. **Initialize CodeQL:** Set up CodeQL tools and database
3. **Build:** Compile code if needed (none for JavaScript)
4. **Analyze:** Run CodeQL queries and generate SARIF results
5. **Upload:** Send results to GitHub Security tab

### Results & Alerts

- **Location:** GitHub Security tab → Code scanning alerts
- **Severity Levels:** Critical, High, Medium, Low, Note, Warning, Error
- **Actions:** Dismiss, Create issue, Fix automatically (when available)

---

## First-Time Setup

### Prerequisites

- Repository admin access
- GitHub account with Actions enabled
- Understanding of your repository's security settings

### Setup Steps

#### 1. Disable Default CodeQL (if enabled)

If your repository has default CodeQL enabled, disable it first:

1. Go to **Settings** → **Code security and analysis**
2. Find **Code scanning** section
3. Click **⋯** menu next to "CodeQL analysis"
4. Select **Disable CodeQL**
5. Confirm the action

> **Why?** Default and Advanced setups cannot coexist. The workflow file will be rejected if default is enabled.

#### 2. Verify Advanced Workflow Exists

Check that `.github/workflows/codeql.yml` is present:

```bash
# From repository root
ls -la .github/workflows/codeql.yml
```

If missing, the workflow file should contain the CodeQL Advanced configuration.

#### 3. Enable GitHub Actions (if needed)

1. Go to **Settings** → **Actions** → **General**
2. Ensure **Actions permissions** is set to:
   - "Allow all actions and reusable workflows" OR
   - "Allow [owner] actions and reusable workflows"
3. Save if changed

#### 4. Set Workflow Permissions

1. In **Settings** → **Actions** → **General**
2. Scroll to **Workflow permissions**
3. Select "Read and write permissions"
4. Enable "Allow GitHub Actions to create and approve pull requests" (optional)
5. Save if changed

> **Note:** The CodeQL workflow needs `security-events: write` permission to upload results.

#### 5. Trigger First Run

**Option A: Push to main branch**
```bash
git commit --allow-empty -m "Trigger CodeQL scan"
git push origin main
```

**Option B: Create a pull request**
- Create a new branch
- Make any change
- Open PR to `main` branch

**Option C: Manual trigger**
- Go to **Actions** tab
- Select "CodeQL Advanced" workflow
- Click **Run workflow** button (if available)

#### 6. Monitor First Run

1. Go to **Actions** tab
2. Find the "CodeQL Advanced" workflow run
3. Watch the progress (takes 2-5 minutes typically)
4. Check for green checkmark ✅

---

## Validation & Monitoring

### Verify Setup is Working

After setup, confirm everything is operational:

#### 1. Check Workflow Status

```bash
# View recent workflow runs
gh run list --workflow=codeql.yml --limit 5

# Or visit in browser:
# https://github.com/[owner]/[repo]/actions/workflows/codeql.yml
```

**Expected:** Recent runs show "Success" status

#### 2. Check Security Tab

1. Go to **Security** tab
2. Click **Code scanning** in sidebar
3. Should see: "CodeQL found X alerts" or "No alerts"

**Expected:** Tab is accessible and shows results

#### 3. Verify Scheduled Runs

- Check that weekly runs occur on Fridays
- View history in **Actions** tab
- Scheduled runs appear with "schedule" trigger

#### 4. Test Pull Request Scanning

1. Create a test branch with a deliberate issue:
   ```javascript
   // Example: eval() is flagged by CodeQL
   const userInput = req.query.code;
   eval(userInput);  // Security vulnerability!
   ```

2. Open pull request
3. CodeQL should run automatically
4. Check for alerts in PR checks

**Expected:** CodeQL runs on PR and reports the issue

### Ongoing Monitoring

#### Weekly Reviews

- Check **Security** → **Code scanning** for new alerts
- Review and dismiss false positives
- Create issues for real vulnerabilities
- Track remediation progress

#### Alert Management

**Priority Response:**
1. **Critical/High:** Fix within 1 week
2. **Medium:** Fix within 1 month
3. **Low:** Fix in next release or dismiss if false positive

**Dismissal Reasons:**
- False positive (with explanation)
- Used in tests (test code, not production)
- Won't fix (technical debt, documented)

---

## Configuration Details

### Customization Options

#### Add Custom Queries

Uncomment and modify in `.github/workflows/codeql.yml`:

```yaml
- name: Initialize CodeQL
  uses: github/codeql-action/init@v4
  with:
    languages: ${{ matrix.language }}
    # Add custom query packs:
    queries: security-extended,security-and-quality
```

#### Change Scan Schedule

Modify the cron expression:

```yaml
schedule:
  - cron: '29 4 * * 5'  # Current: Fridays at 4:29 AM UTC
  # Examples:
  # - cron: '0 0 * * *'    # Daily at midnight
  # - cron: '0 9 * * 1'    # Mondays at 9 AM
```

#### Add More Languages

If you add new languages (Python, Go, etc.):

```yaml
matrix:
  include:
    - language: actions
      build-mode: none
    - language: javascript-typescript
      build-mode: none
    - language: python
      build-mode: none
    # Add more as needed
```

### Performance Tuning

#### Increase Runner Size

For faster analysis on large codebases:

```yaml
runs-on: ubuntu-latest-4-cores  # or ubuntu-latest-8-cores
```

**Note:** Requires GitHub Team or Enterprise plan

#### Exclude Paths

Create `.github/codeql/codeql-config.yml`:

```yaml
name: "CodeQL Config"
paths-ignore:
  - "node_modules/**"
  - "tests/**"
  - "docs/**"
```

Then reference in workflow:

```yaml
- name: Initialize CodeQL
  uses: github/codeql-action/init@v4
  with:
    languages: ${{ matrix.language }}
    config-file: .github/codeql/codeql-config.yml
```

---

## Troubleshooting

For issues with security scanning, see:

- [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions
- [README.md](../README.md) - Quick setup guide

### Quick Fixes

**Workflow not running:**
- Check Actions are enabled in repository settings
- Verify workflow file syntax with YAML linter
- Ensure you have push access to the branch

**SARIF upload rejected:**
- Disable default CodeQL setup (see First-Time Setup)
- Check workflow permissions include `security-events: write`
- Verify you're not hitting GitHub's rate limits

**No alerts showing:**
- CodeQL may have found no issues (good!)
- Check workflow completed successfully
- Allow a few minutes for alerts to appear in Security tab

---

## Additional Resources

### GitHub Documentation

- [About code scanning with CodeQL](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql)
- [Configuring advanced setup](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/configuring-advanced-setup-for-code-scanning)
- [Managing code scanning alerts](https://docs.github.com/en/code-security/code-scanning/managing-code-scanning-alerts)
- [CodeQL query help](https://codeql.github.com/codeql-query-help/)

### CodeQL Resources

- [CodeQL Documentation](https://codeql.github.com/docs/)
- [CodeQL Query Console](https://github.com/github/codeql) - Write custom queries
- [CodeQL for VS Code](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-codeql) - Local analysis

### Community

- [GitHub Security Lab](https://securitylab.github.com/)
- [CodeQL Discussions](https://github.com/github/codeql/discussions)

---

## Security Policy

For reporting security vulnerabilities, see our [Security Policy](../SECURITY.md) (if exists) or contact the repository maintainers directly.

**Do not:**
- Report security issues in public GitHub issues
- Share vulnerability details publicly before fix is released

---

*Last Updated: 2026-01-03*
