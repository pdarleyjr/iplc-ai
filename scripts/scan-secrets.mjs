import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

// Common patterns for secrets
const SECRET_PATTERNS = [
  // GitHub tokens
  /ghp_[a-zA-Z0-9]{36}/g,
  /ghs_[a-zA-Z0-9]{36}/g,
  /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
  
  // API keys and tokens
  /api[_-]?key[_-]?[=:]\s*["']?[a-zA-Z0-9]{20,}/gi,
  /secret[_-]?key[_-]?[=:]\s*["']?[a-zA-Z0-9]{20,}/gi,
  /access[_-]?token[_-]?[=:]\s*["']?[a-zA-Z0-9]{20,}/gi,
  /auth[_-]?token[_-]?[=:]\s*["']?[a-zA-Z0-9]{20,}/gi,
  /bearer[_-]?token[_-]?[=:]\s*["']?[a-zA-Z0-9]{20,}/gi,
  
  // Passwords
  /password[_-]?[=:]\s*["']?[^\s"']{8,}/gi,
  /passwd[_-]?[=:]\s*["']?[^\s"']{8,}/gi,
  /pwd[_-]?[=:]\s*["']?[^\s"']{8,}/gi,
  
  // Private keys
  /-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/g,
  /-----BEGIN\s+PRIVATE\s+KEY-----/g,
  
  // AWS
  /AKIA[A-Z0-9]{16}/g,
  /aws[_-]?secret[_-]?access[_-]?key[_-]?[=:]\s*["']?[a-zA-Z0-9/+=]{40}/gi,
  
  // Cloudflare
  /CF_API_TOKEN[_-]?[=:]\s*["']?[a-zA-Z0-9_-]{40,}/gi,
  /CF_ACCOUNT_ID[_-]?[=:]\s*["']?[a-zA-Z0-9]{32}/gi,
  
  // Other common patterns
  /client[_-]?secret[_-]?[=:]\s*["']?[a-zA-Z0-9]{20,}/gi,
  /private[_-]?key[_-]?[=:]\s*["']?[a-zA-Z0-9]{20,}/gi,
];

// Patterns to ignore (false positives)
const IGNORE_PATTERNS = [
  /\bexample\b/i,
  /\btest\b/i,
  /\bdummy\b/i,
  /\bfake\b/i,
  /\bplaceholder\b/i,
  /\bXXX+/,
  /\byour[_-]?api[_-]?key/i,
  /\byour[_-]?token/i,
  /\b<[^>]+>/,  // Ignore placeholders like <your-api-key>
];

// Get staged files
function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    return output.trim().split('\n').filter(file => file);
  } catch (error) {
    console.error('Error getting staged files:', error.message);
    return [];
  }
}

// Check if a match should be ignored
function shouldIgnore(match, line) {
  return IGNORE_PATTERNS.some(pattern => pattern.test(line));
}

// Scan a file for secrets
function scanFile(filePath) {
  const issues = [];
  
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, lineNumber) => {
      SECRET_PATTERNS.forEach(pattern => {
        const matches = line.match(pattern);
        if (matches) {
          matches.forEach(match => {
            if (!shouldIgnore(match, line)) {
              issues.push({
                file: filePath,
                line: lineNumber + 1,
                match: match.substring(0, 50) + (match.length > 50 ? '...' : ''),
                pattern: pattern.source.substring(0, 30) + '...'
              });
            }
          });
        }
      });
    });
  } catch (error) {
    // Ignore binary files or files that can't be read
    if (error.code !== 'EISDIR' && !error.message.includes('Invalid')) {
      console.warn(`Warning: Could not scan ${filePath}: ${error.message}`);
    }
  }
  
  return issues;
}

// Main function
function main() {
  console.log('🔍 Scanning staged files for potential secrets...\n');
  
  const stagedFiles = getStagedFiles();
  
  if (stagedFiles.length === 0) {
    console.log('No staged files to scan.');
    process.exit(0);
  }
  
  console.log(`Scanning ${stagedFiles.length} staged file(s)...\n`);
  
  const allIssues = [];
  
  stagedFiles.forEach(file => {
    const issues = scanFile(file);
    allIssues.push(...issues);
  });
  
  if (allIssues.length > 0) {
    console.error('❌ POTENTIAL SECRETS DETECTED!\n');
    console.error('The following potential secrets were found in your staged files:\n');
    
    allIssues.forEach(issue => {
      console.error(`  File: ${issue.file}:${issue.line}`);
      console.error(`  Match: ${issue.match}`);
      console.error(`  Pattern: ${issue.pattern}\n`);
    });
    
    console.error('Please remove these secrets before committing.');
    console.error('If these are false positives, you can bypass this check with: git commit --no-verify\n');
    process.exit(1);
  }
  
  console.log('✅ No secrets detected in staged files.\n');
  process.exit(0);
}

// Run the scanner
main();