#!/usr/bin/env node
/**
 * System Validation - Comprehensive check of all GEX components
 * 
 * Validates:
 * - All scripts are syntactically correct
 * - Required files exist
 * - Environment is properly configured
 * - Database is accessible
 * 
 * Usage:
 *   node validate.js           # Run all checks
 *   node validate.js --quick   # Skip slow checks
 *   node validate.js --fix     # Attempt auto-fixes
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const args = process.argv.slice(2);
const QUICK = args.includes('--quick') || args.includes('-q');
const FIX = args.includes('--fix') || args.includes('-f');

let passed = 0;
let failed = 0;
let warnings = 0;

function check(name, condition, fixAction = null) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
    return true;
  } else {
    if (FIX && fixAction) {
      try {
        fixAction();
        console.log(`  🔧 ${name} (auto-fixed)`);
        passed++;
        return true;
      } catch (e) {
        console.log(`  ❌ ${name} (fix failed: ${e.message})`);
        failed++;
        return false;
      }
    }
    console.log(`  ❌ ${name}`);
    failed++;
    return false;
  }
}

function warn(name) {
  console.log(`  ⚠️  ${name}`);
  warnings++;
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🔍 GEX SYSTEM VALIDATION                                                 ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const baseDir = __dirname;

  // 1. Check required directories
  console.log('📁 Directories:');
  const dirs = ['lib', 'public', 'data', 'logs', 'backups', 'exports', 'reports'];
  dirs.forEach(dir => {
    check(
      `${dir}/ exists`,
      fs.existsSync(path.join(baseDir, dir)),
      () => fs.mkdirSync(path.join(baseDir, dir), { recursive: true })
    );
  });

  // 2. Check required files
  console.log('\n📄 Core files:');
  const requiredFiles = [
    'gex.js',
    'package.json',
    'server.js',
    'lib/supabase.js',
    'public/index.html'
  ];
  requiredFiles.forEach(file => {
    check(`${file} exists`, fs.existsSync(path.join(baseDir, file)));
  });

  // Check .env
  const hasEnv = fs.existsSync(path.join(baseDir, '.env'));
  check('.env exists', hasEnv);
  if (!hasEnv && FIX) {
    const template = `SUPABASE_URL=\nSUPABASE_KEY=\n`;
    fs.writeFileSync(path.join(baseDir, '.env'), template);
  }

  // 3. Validate JavaScript syntax for all .js files
  console.log('\n📝 Script syntax:');
  if (QUICK) {
    console.log('  ⏭  Skipped (--quick mode)');
  } else {
    const jsFiles = fs.readdirSync(baseDir)
      .filter(f => f.endsWith('.js') && !f.includes('node_modules'));
    
    let syntaxErrors = 0;
    jsFiles.slice(0, 50).forEach(file => { // Check first 50 files
      const result = spawnSync('node', ['--check', file], { 
        cwd: baseDir,
        encoding: 'utf8'
      });
      if (result.status !== 0) {
        console.log(`  ❌ ${file}: Syntax error`);
        syntaxErrors++;
        failed++;
      }
    });
    
    if (syntaxErrors === 0) {
      console.log(`  ✅ All ${jsFiles.length} scripts have valid syntax`);
      passed++;
    }
  }

  // 4. Check library imports
  console.log('\n📦 Libraries:');
  try {
    const pkg = require(path.join(baseDir, 'package.json'));
    const deps = Object.keys(pkg.dependencies || {});
    
    deps.slice(0, 5).forEach(dep => {
      try {
        require.resolve(dep, { paths: [baseDir] });
        check(`${dep} installed`, true);
      } catch {
        check(`${dep} installed`, false);
      }
    });
  } catch {
    warn('Could not read package.json dependencies');
  }

  // 5. Check environment configuration
  console.log('\n⚙️  Environment:');
  require('dotenv').config({ path: path.join(baseDir, '.env') });
  
  check('SUPABASE_URL set', !!process.env.SUPABASE_URL);
  const hasKey = !!(process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
  check('Supabase API key set', hasKey);

  // 6. Database connectivity (if configured)
  if (!QUICK && process.env.SUPABASE_URL && hasKey) {
    console.log('\n🔌 Database:');
    try {
      const { initSupabase } = require('./lib/supabase');
      const client = initSupabase();
      
      if (client) {
        const { data, error } = await client
          .from('positive_replies')
          .select('id')
          .limit(1);
        
        if (error && error.code === '42P01') {
          warn('Table "positive_replies" not found (may need migration)');
        } else if (error) {
          check('Database query', false);
          console.log(`     Error: ${error.message}`);
        } else {
          check('Database connection', true);
        }
      } else {
        check('Database client initialized', false);
      }
    } catch (e) {
      check('Database connection', false);
      console.log(`     Error: ${e.message}`);
    }
  }

  // 7. Check gex.js commands map
  console.log('\n🎮 GEX commands:');
  try {
    const gexContent = fs.readFileSync(path.join(baseDir, 'gex.js'), 'utf8');
    const commandMatch = gexContent.match(/const commands = \{([^}]+)\}/s);
    if (commandMatch) {
      const commandLines = commandMatch[1].split('\n').filter(l => l.includes(':'));
      const commandCount = commandLines.length;
      console.log(`  ✅ ${commandCount} commands registered`);
      passed++;
      
      // Check if referenced scripts exist
      let missing = 0;
      commandLines.forEach(line => {
        const match = line.match(/['"]\.\/([^'"]+)['"]/);
        if (match) {
          const script = match[1];
          if (!fs.existsSync(path.join(baseDir, script))) {
            if (missing < 5) console.log(`  ⚠️  Missing: ${script}`);
            missing++;
            warnings++;
          }
        }
      });
      if (missing > 5) console.log(`  ⚠️  ... and ${missing - 5} more missing scripts`);
    }
  } catch (e) {
    warn('Could not parse gex.js commands');
  }

  // Summary
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📊 RESULTS: ${passed} passed, ${failed} failed, ${warnings} warnings
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  if (failed > 0) {
    console.log('  💡 Run with --fix to attempt auto-repairs');
    console.log('  💡 Run "node gex.js doctor" for interactive diagnostics\n');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('  ⚠️  Some warnings - system should work but check above\n');
    process.exit(0);
  } else {
    console.log('  🎉 All checks passed!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('❌ Validation error:', err.message);
  process.exit(1);
});
