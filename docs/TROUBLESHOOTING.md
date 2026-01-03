# 🔧 Troubleshooting Guide

This guide helps you resolve common issues when working with the KuCoin Futures Dashboard.

## Table of Contents

- [Security Scanning Issues](#security-scanning-issues)
- [CI/Build Failures](#cibuild-failures)
- [API Connection Issues](#api-connection-issues)
- [Installation Problems](#installation-problems)

---

## Security Scanning Issues

### CodeQL Configuration Conflict

**Symptom:**
The CodeQL Advanced workflow fails with the error:
```
CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled
```

**Root Cause:**
GitHub's default CodeQL setup and the advanced workflow configuration (`.github/workflows/codeql.yml`) cannot run simultaneously. The repository has both enabled, causing the SARIF upload to be rejected.

**Solution:**

1. **Check if Default CodeQL is Enabled:**
   - Go to your repository on GitHub
   - Navigate to **Settings** → **Code security and analysis**
   - Look for **Code scanning** section
   - If you see "CodeQL analysis" with status "On" or "Default setup", it's enabled

2. **Disable Default CodeQL Setup:**
   - In the **Code scanning** section, click the **⋯** (three dots) menu
   - Select **Disable CodeQL**
   - Confirm the action when prompted
   
3. **Verify Advanced Workflow:**
   - The advanced setup is defined in `.github/workflows/codeql.yml`
   - It will automatically run on push, pull requests, and weekly schedule
   - Check the **Actions** tab to see workflow runs

4. **Re-run Failed Workflow:**
   - Go to **Actions** tab
   - Find the failed CodeQL workflow
   - Click **Re-run jobs** → **Re-run failed jobs**

**Prevention:**
- When forking or setting up a new repository, don't enable default CodeQL if you plan to use the advanced configuration
- The config validation workflow (`.github/workflows/config-validation.yml`) will warn about potential conflicts

**Related Documentation:**
- [GitHub Docs: About code scanning with CodeQL](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql)
- [GitHub Docs: Configuring advanced setup for code scanning](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/configuring-advanced-setup-for-code-scanning)

---

### CodeQL Workflow Not Running

**Symptom:**
The CodeQL workflow doesn't appear in the Actions tab or isn't triggered.

**Possible Causes & Solutions:**

1. **Workflow File Missing or Invalid:**
   - Verify `.github/workflows/codeql.yml` exists
   - Check YAML syntax with a validator
   - Ensure proper indentation (use spaces, not tabs)

2. **Branch Protection:**
   - Workflow may be disabled for certain branches
   - Check repository settings for branch protection rules

3. **Permissions:**
   - Ensure the workflow has proper permissions in the YAML file
   - Required: `security-events: write`, `actions: read`, `contents: read`

---

## CI/Build Failures

### Test Failures

**Symptom:**
The CI workflow fails with test errors.

**Diagnostic Steps:**

1. **Run Tests Locally:**
   ```bash
   npm test
   ```

2. **Check Test Output:**
   - Review the specific test that failed
   - Look for assertion errors or timeouts

3. **Common Issues:**
   - **Missing dependencies:** Run `npm install`
   - **Environment variables:** Check `.env` configuration
   - **Node version:** Ensure Node.js >= 16.0.0 (check with `node --version`)

### Dependency Installation Failures

**Symptom:**
`npm install` or `npm ci` fails in CI.

**Solutions:**

1. **Check package-lock.json:**
   - Ensure it's committed to the repository
   - Run `npm install` locally and commit any changes

2. **Node Version:**
   - CI uses Node.js 20
   - Ensure your `package.json` engines field matches

3. **Private Packages:**
   - If using private npm packages, ensure proper authentication

---

## API Connection Issues

### KuCoin API Authentication Failures

**Symptom:**
Error messages about invalid API key, secret, or passphrase.

**Solutions:**

1. **Verify Credentials:**
   ```bash
   # Check .env file exists
   cat .env | grep KUCOIN_API
   ```

2. **Generate New API Keys:**
   - Go to [KuCoin API Management](https://www.kucoin.com/account/api)
   - Create new API key with **Futures Trading** permissions
   - Copy all three values: API Key, Secret, Passphrase

3. **Check Environment Variables:**
   - Ensure `.env` file is in the root directory
   - Format should be:
     ```
     KUCOIN_API_KEY=your_key_here
     KUCOIN_API_SECRET=your_secret_here
     KUCOIN_API_PASSPHRASE=your_passphrase_here
     ```
   - No quotes needed around values

4. **IP Whitelist:**
   - Some API keys require IP whitelisting
   - Check KuCoin API settings for IP restrictions

### Rate Limiting

**Symptom:**
Error 429 (Too Many Requests) or rate limit messages.

**Solutions:**

1. **Built-in Retry Logic:**
   - The system automatically retries after rate limits
   - Check retry queue status: `GET /health`

2. **Reduce Request Frequency:**
   - Increase polling intervals in config
   - Reduce number of active positions

3. **Upgrade API Tier:**
   - KuCoin offers higher rate limits for VIP accounts

---

## Installation Problems

### npm install Fails

**Symptom:**
Error during `npm install`.

**Solutions:**

1. **Clear npm Cache:**
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check Node Version:**
   ```bash
   node --version  # Should be >= 16.0.0
   ```

3. **Use Compatible npm:**
   ```bash
   npm install -g npm@latest
   ```

### Demo Mode Not Working

**Symptom:**
Server doesn't start in demo mode or shows API errors.

**Solutions:**

1. **Enable Demo Mode:**
   ```bash
   # In .env file:
   DEMO_MODE=true
   ```

2. **Verify Configuration:**
   - Demo mode doesn't require API credentials
   - Check server.js for demo mode initialization
   - Look for "Demo mode enabled" in console output

---

## Getting Help

If you can't resolve your issue:

1. **Check Existing Issues:**
   - Search [GitHub Issues](https://github.com/Ritenoob/miniature-enigma/issues)
   - Look for similar problems and solutions

2. **Create a New Issue:**
   - Include error messages (full stack trace)
   - Describe steps to reproduce
   - Mention your environment (OS, Node version, npm version)
   - Share relevant configuration (without secrets!)

3. **Review Documentation:**
   - [README.md](../README.md) - Main documentation
   - [SECURITY_SCANNING.md](SECURITY_SCANNING.md) - Security setup details
   - [GitHub Copilot Instructions](../.github/copilot-instructions.md) - Development guidelines

---

## Additional Resources

- **KuCoin API Documentation:** https://docs.kucoin.com/futures/
- **Node.js Documentation:** https://nodejs.org/docs/
- **GitHub Actions Documentation:** https://docs.github.com/actions
- **CodeQL Documentation:** https://codeql.github.com/docs/

---

*Last Updated: 2026-01-03*
