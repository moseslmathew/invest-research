---
name: security-scan
description: Run security audits, dependency checks, secret leak detection, and API route safety verification on the codebase.
---

# Codebase Security Scan

This skill provides automated static analysis and dependency audits to identify security vulnerabilities before code is pushed to production.

## Scopes Covered
- **Exposed Secrets**: Detects OpenAI keys, Clerk secret keys, and database connection strings.
- **SQL Injection**: Finds potential unparameterized SQL interpolations.
- **Unprotected APIs**: Highlights Next.js API route files (`app/api/*`) lacking session authentication/authorization checks.
- **Dependency Vulnerabilities**: Scans external dependencies for known security warnings.

## Running Scans

### 1. Run Static Analysis Scan
Execute the custom JavaScript scanner to check codebase structure and file contents:

```bash
node .agents/skills/security-scan/scripts/scan.js
```

### 2. Run Dependency Audit
Check your `package.json` third-party packages against the national database of known vulnerabilities:

```bash
npm audit
```

---

> [!IMPORTANT]
> **Remediation Steps**
> - **Leaked Keys**: Immediately rotate any leaked credentials and remove them from the source code.
> - **Insecure SQL**: Convert query string interpolations to parameterized values.
> - **API Endpoints**: Wrap unprotected route handlers with session verification (`auth()` or `apiGuard`).
