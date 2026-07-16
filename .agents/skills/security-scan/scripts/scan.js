const fs = require('fs');
const path = require('path');

const EXCLUDED_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.gemini', '.claude']);
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.env']);

const RULES = [
  {
    name: 'Exposed OpenAI Key Pattern',
    regex: /sk-proj-[a-zA-Z0-9]{30,}/g,
    severity: 'CRITICAL',
    description: 'Detected a potential hardcoded OpenAI API key.'
  },
  {
    name: 'Exposed Clerk Secret Key Pattern',
    regex: /sk_live_[a-zA-Z0-9]{20,}/g,
    severity: 'CRITICAL',
    description: 'Detected a potential hardcoded Clerk live secret key.'
  },
  {
    name: 'Exposed Clerk Test Key Pattern',
    regex: /sk_test_[a-zA-Z0-9]{20,}/g,
    severity: 'WARNING',
    description: 'Detected a potential hardcoded Clerk test secret key.'
  },
  {
    name: 'Hardcoded Database URL / Connection String',
    regex: /postgres(ql)?:\/\/[a-zA-Z0-9_.-]+:[^@]+@[a-zA-Z0-9_.-]+/g,
    severity: 'CRITICAL',
    description: 'Detected a hardcoded PostgreSQL credentials connection string.'
  },
  {
    name: 'Potential SQL Injection / Unsafe Raw Query Concatenation',
    regex: /sql\(\s*['"].*\$\{.*['"]\s*\)/g,
    severity: 'HIGH',
    description: 'Detected interpolation inside raw SQL string literals which can lead to SQL injection.'
  },
  {
    name: 'Unprotected API Route',
    severity: 'MEDIUM',
    customCheck: (filePath, content) => {
      if (filePath.includes('app/api/') && filePath.endsWith('route.ts')) {
        const hasAuthCheck = content.includes('auth()') || content.includes('requireAuth') || content.includes('api-guard') || content.includes('verifySession');
        if (!hasAuthCheck) {
          return 'This API route does not appear to perform Clerk or api-guard authentication checks.';
        }
      }
      return null;
    }
  }
];

function scanDirectory(dir, findings) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!EXCLUDED_DIRS.has(file)) {
        scanDirectory(fullPath, findings);
      }
    } else {
      const ext = path.extname(file);
      if (SCAN_EXTENSIONS.has(ext)) {
        scanFile(fullPath, findings);
      }
    }
  }
}

function scanFile(filePath, findings) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (const rule of RULES) {
    if (rule.regex) {
      lines.forEach((line, index) => {
        // Skip comment lines or import statements matching patterns
        if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('import')) {
          return;
        }
        if (rule.regex.test(line)) {
          findings.push({
            file: filePath,
            line: index + 1,
            rule: rule.name,
            severity: rule.severity,
            description: rule.description,
            snippet: line.trim()
          });
        }
      });
    } else if (rule.customCheck) {
      const issue = rule.customCheck(filePath, content);
      if (issue) {
        findings.push({
          file: filePath,
          line: 1,
          rule: rule.name,
          severity: rule.severity,
          description: issue,
          snippet: 'N/A'
        });
      }
    }
  }
}

const workspaceRoot = process.argv[2] || process.cwd();
const findings = [];

console.log(`Starting codebase static security scan at: ${workspaceRoot}`);
scanDirectory(workspaceRoot, findings);

if (findings.length === 0) {
  console.log('\n✅ No critical static security pattern issues detected.');
} else {
  console.log(`\n⚠️ Detected ${findings.length} security warning(s):`);
  findings.forEach((f, i) => {
    const relativePath = path.relative(workspaceRoot, f.file);
    console.log(`[${i + 1}] [${f.severity}] ${f.rule}`);
    console.log(`    File: ${relativePath}:${f.line}`);
    console.log(`    Detail: ${f.description}`);
    if (f.snippet !== 'N/A') {
      console.log(`    Snippet: ${f.snippet}`);
    }
    console.log('----------------------------------------------------');
  });
}
