#!/usr/bin/env node
/**
 * Backup System
 * 
 * Creates automatic backups of:
 * - Lead data
 * - Configuration
 * - Generated reports
 * 
 * Usage:
 *   node backup-system.js create   # Create backup
 *   node backup-system.js list     # List backups
 *   node backup-system.js restore <file>  # Restore
 *   node backup-system.js clean    # Remove old backups
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initSupabase } = require('./lib/supabase');

const BACKUP_DIR = './backups';

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `backup-${timestamp}.json`;
  const filepath = path.join(BACKUP_DIR, filename);

  console.log(`\n📦 Creating backup: ${filename}\n`);

  const client = initSupabase();
  if (!client) {
    console.log('❌ Could not connect to database');
    return null;
  }

  // Fetch all data
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*');

  if (error) {
    console.log(`❌ Error fetching data: ${error.message}`);
    return null;
  }

  const backup = {
    timestamp: new Date().toISOString(),
    version: '1.0',
    leads: leads,
    meta: {
      totalLeads: leads.length,
      booked: leads.filter(l => l.reply_category === 'Booked').length,
      meetings: leads.filter(l => l.reply_category === 'Meeting Request').length
    }
  };

  fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));
  
  const stats = fs.statSync(filepath);
  console.log(`✅ Backup created: ${filename}`);
  console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`   Leads: ${backup.meta.totalLeads}`);
  console.log(`   Booked: ${backup.meta.booked}`);
  
  return filepath;
}

function listBackups() {
  console.log('\n📦 Available Backups:\n');

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log('No backups found');
    return;
  }

  files.forEach((file, i) => {
    const filepath = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(filepath);
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    
    console.log(`${i + 1}. ${file}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB | Leads: ${data.meta?.totalLeads || 'N/A'}`);
  });
}

async function restoreBackup(filename) {
  const filepath = path.join(BACKUP_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    console.log(`❌ Backup not found: ${filename}`);
    return false;
  }

  console.log(`\n⚠️  Restore functionality is read-only for safety.`);
  console.log(`   To restore, manually import the data from:`);
  console.log(`   ${filepath}\n`);
  
  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  console.log(`Backup contains:`);
  console.log(`   Leads: ${data.meta?.totalLeads}`);
  console.log(`   Date: ${data.timestamp}`);
  
  return true;
}

function cleanOldBackups(keepDays = 30) {
  console.log(`\n🧹 Cleaning backups older than ${keepDays} days...\n`);

  const cutoff = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
  
  let removed = 0;
  files.forEach(file => {
    const filepath = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(filepath);
    
    if (stats.mtimeMs < cutoff) {
      fs.unlinkSync(filepath);
      console.log(`   Removed: ${file}`);
      removed++;
    }
  });

  console.log(`\n✅ Cleaned ${removed} old backups`);
}

async function main() {
  const action = process.argv[2] || 'list';
  const arg = process.argv[3];

  switch (action) {
    case 'create':
      await createBackup();
      break;
    case 'list':
      listBackups();
      break;
    case 'restore':
      if (!arg) {
        console.log('Usage: node backup-system.js restore <filename>');
        return;
      }
      await restoreBackup(arg);
      break;
    case 'clean':
      cleanOldBackups(parseInt(arg) || 30);
      break;
    default:
      console.log('Available commands: create, list, restore, clean');
  }
}

module.exports = { createBackup, listBackups, restoreBackup, cleanOldBackups };

if (require.main === module) {
  main().catch(console.error);
}
