# Code Scanning Configuration

## CodeQL Setup

This repository uses **Advanced CodeQL configuration** managed via workflow file.

### Configuration File
- Path: `.github/workflows/codeql.yml`
- Languages: actions, javascript-typescript
- Build mode: none (interpreted languages)

### Critical Restriction

❌ **DO NOT** enable "Default" CodeQL setup in GitHub Security settings  
✅ **DO** modify `.github/workflows/codeql.yml` for configuration changes

**Why?** GitHub CodeQL does not support running both Default and Advanced setups concurrently. Enabling Default setup will cause Advanced workflow failures with error:
```
CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled
```

### How to Disable Default CodeQL (if accidentally enabled)

1. Navigate to repository Settings → Security & analysis
2. Find "Code scanning" section
3. If "CodeQL analysis" shows "Set up" or "Enabled":
   - Click the "..." menu
   - Select "Disable" or "Remove"
4. Wait 5 minutes for GitHub to propagate the change
5. Re-run the failed workflow

### Modifying Advanced Setup

To change languages, queries, or schedule:
1. Edit `.github/workflows/codeql.yml`
2. Commit changes to a branch
3. Open pull request for review
4. Merge after CI passes

### Monitoring

- View CodeQL results: Security tab → Code scanning alerts
- View workflow runs: Actions tab → CodeQL Advanced workflow
- Workflow schedule: Weekly on Fridays at 4:29 AM UTC

### References
- [CodeQL Advanced Setup Docs](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning)
- [Troubleshooting CodeQL](https://docs.github.com/en/code-security/code-scanning/troubleshooting-code-scanning)
