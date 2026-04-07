/**
 * Bull BRO Backup & Recovery
 * Backs up all data files and allows restoration
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
const PARENT_DIR = path.dirname(__dirname);
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Files to backup from bull-bro directory
const BULL_BRO_FILES = [
  'drafts.json',
  'audit-log.json',
  'config.json',
  'health-status.json',
  'alerts.json'
];

// Files to backup from parent directory
const PARENT_FILES = [
  'edit-tracking.json',
  'ghost-tracking.json',
  'trigger-events.json',
  'deal-velocity.json'
];

// Ensure backup directory exists
const ensureBackupDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
};

// Get today's date string
const getDateStr = () => new Date().toISOString().split('T')[0];

// Create backup
const createBackup = () => {
  ensureBackupDir();
  
  const dateStr = getDateStr();
  const backupPath = path.join(BACKUP_DIR, dateStr);
  
  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
  }
  
  console.log(`🐂 Bull BRO Backup - ${dateStr}`);
  console.log('================================\n');
  
  let backed = 0;
  let skipped = 0;
  
  // Backup bull-bro files
  BULL_BRO_FILES.forEach(file => {
    const src = path.join(DATA_DIR, file);
    const dest = path.join(backupPath, file);
    
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      const size = fs.statSync(src).size;
      console.log(`✅ ${file} (${(size / 1024).toFixed(1)}KB)`);
      backed++;
    } else {
      console.log(`⏭️ ${file} (not found)`);
      skipped++;
    }
  });
  
  // Backup parent directory files
  PARENT_FILES.forEach(file => {
    const src = path.join(PARENT_DIR, file);
    const dest = path.join(backupPath, `parent_${file}`);
    
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      const size = fs.statSync(src).size;
      console.log(`✅ ${file} (${(size / 1024).toFixed(1)}KB)`);
      backed++;
    } else {
      console.log(`⏭️ ${file} (not found)`);
      skipped++;
    }
  });
  
  console.log(`\n📦 Backup complete: ${backed} files backed up, ${skipped} skipped`);
  console.log(`📁 Location: ${backupPath}`);
  
  // Clean old backups (keep last 30 days)
  cleanOldBackups();
  
  // Log to audit
  logAudit('backup_created', { date: dateStr, files: backed });
};

// List backups
const listBackups = () => {
  ensureBackupDir();
  
  console.log('🐂 Bull BRO Backups');
  console.log('===================\n');
  
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
    .sort()
    .reverse();
  
  if (backups.length === 0) {
    console.log('No backups found.');
    console.log('Run: node backup.js create');
    return;
  }
  
  backups.forEach(backup => {
    const backupPath = path.join(BACKUP_DIR, backup);
    const files = fs.readdirSync(backupPath);
    const totalSize = files.reduce((sum, f) => {
      return sum + fs.statSync(path.join(backupPath, f)).size;
    }, 0);
    
    console.log(`📅 ${backup} - ${files.length} files (${(totalSize / 1024).toFixed(1)}KB)`);
  });
  
  console.log(`\n${backups.length} backup(s) available`);
};

// Restore from backup
const restoreBackup = (dateStr) => {
  const backupPath = path.join(BACKUP_DIR, dateStr);
  
  if (!fs.existsSync(backupPath)) {
    console.log(`❌ Backup not found: ${dateStr}`);
    console.log('Run: node backup.js list');
    return;
  }
  
  console.log(`🐂 Bull BRO Restore - ${dateStr}`);
  console.log('================================\n');
  
  let restored = 0;
  
  const files = fs.readdirSync(backupPath);
  
  files.forEach(file => {
    const src = path.join(backupPath, file);
    let dest;
    
    if (file.startsWith('parent_')) {
      // Parent directory file
      dest = path.join(PARENT_DIR, file.replace('parent_', ''));
    } else {
      // Bull-bro file
      dest = path.join(DATA_DIR, file);
    }
    
    fs.copyFileSync(src, dest);
    console.log(`✅ Restored: ${file}`);
    restored++;
  });
  
  console.log(`\n📦 Restore complete: ${restored} files restored`);
  
  // Log to audit
  logAudit('backup_restored', { date: dateStr, files: restored });
};

// Clean old backups
const cleanOldBackups = () => {
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
    .sort();
  
  if (backups.length <= 30) return;
  
  const toDelete = backups.slice(0, backups.length - 30);
  
  toDelete.forEach(backup => {
    const backupPath = path.join(BACKUP_DIR, backup);
    fs.rmSync(backupPath, { recursive: true });
    console.log(`🗑️ Deleted old backup: ${backup}`);
  });
};

// Audit logger
const logAudit = (action, details) => {
  try {
    const auditPath = path.join(DATA_DIR, 'audit-log.json');
    let log = [];
    if (fs.existsSync(auditPath)) {
      log = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    }
    log.unshift({
      timestamp: new Date().toISOString(),
      action,
      details,
      user: 'backup-system'
    });
    if (log.length > 1000) log.length = 1000;
    fs.writeFileSync(auditPath, JSON.stringify(log, null, 2));
  } catch (e) {}
};

// CLI
const command = process.argv[2];
const arg = process.argv[3];

// Show backup details
const showBackup = (dateStr) => {
  const backupPath = path.join(BACKUP_DIR, dateStr);
  
  if (!fs.existsSync(backupPath)) {
    console.log(`❌ Backup not found: ${dateStr}`);
    console.log('Run: node backup.js list');
    return;
  }
  
  console.log(`🐂 Bull BRO Backup - ${dateStr}`);
  console.log('================================\n');
  
  const files = fs.readdirSync(backupPath);
  let totalSize = 0;
  
  files.forEach(file => {
    const filePath = path.join(backupPath, file);
    const size = fs.statSync(filePath).size;
    totalSize += size;
    console.log(`  ${file.padEnd(30)} ${(size / 1024).toFixed(1)}KB`);
  });
  
  console.log(`\nTotal: ${files.length} files, ${(totalSize / 1024).toFixed(1)}KB`);
};

switch (command) {
  case 'create':
    createBackup();
    break;
  case 'list':
    listBackups();
    break;
  case 'show':
    if (!arg) {
      console.log('Usage: node backup.js show YYYY-MM-DD');
      process.exit(1);
    }
    showBackup(arg);
    break;
  case 'restore':
    if (!arg) {
      console.log('Usage: node backup.js restore YYYY-MM-DD');
      process.exit(1);
    }
    restoreBackup(arg);
    break;
  case 'clean':
    cleanOldBackups();
    break;
  default:
    console.log('🐂 Bull BRO Backup & Recovery');
    console.log('=============================\n');
    console.log('Commands:');
    console.log('  node backup.js create         Create a new backup');
    console.log('  node backup.js list           List all backups');
    console.log('  node backup.js show DATE      Show backup details');
    console.log('  node backup.js restore DATE   Restore from backup (YYYY-MM-DD)');
    console.log('  node backup.js clean          Remove backups older than 30 days');
}

module.exports = { createBackup, listBackups, restoreBackup, showBackup, cleanOldBackups };
