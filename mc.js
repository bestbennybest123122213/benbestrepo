#!/usr/bin/env node
/**
 * Mission Control Bridge
 * 
 * Quick access to Mission Control from within GEX.
 * 
 * Usage:
 *   node mc.js                    # Show summary
 *   node mc.js add "Task title"   # Add task to backlog
 *   node mc.js done <task-id>     # Mark task done
 *   node mc.js log "message"      # Log activity
 */

const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const ACTION = args[0] || 'summary';
const MC_PATH = path.join(__dirname, '..', 'mission-control');

function runMC(command) {
  try {
    const output = execSync(`./update.sh ${command}`, {
      cwd: MC_PATH,
      encoding: 'utf8'
    });
    return output;
  } catch (e) {
    console.error(`❌ Mission Control error: ${e.message}`);
    return null;
  }
}

function main() {
  switch (ACTION) {
    case 'summary':
    case 's':
      console.log(runMC('summary'));
      break;
      
    case 'add':
    case 'a':
      const title = args.slice(1).join(' ');
      if (!title) {
        console.error('Usage: node mc.js add "Task title"');
        process.exit(1);
      }
      console.log(runMC(`add-task backlog "${title}" "" "GEX" "Clawdbot" "normal"`));
      break;
      
    case 'done':
    case 'd':
      const taskId = args[1];
      if (!taskId) {
        console.error('Usage: node mc.js done <task-id>');
        process.exit(1);
      }
      // Find the task first
      const listOutput = runMC('list-tasks');
      const lines = listOutput.split('\n');
      let fromColumn = null;
      let currentColumn = null;
      
      for (const line of lines) {
        if (line.includes('📋')) {
          currentColumn = line.match(/📋 (\w+)/)?.[1];
        }
        if (line.includes(`[${taskId}]`)) {
          fromColumn = currentColumn;
          break;
        }
      }
      
      if (fromColumn) {
        console.log(runMC(`move-task ${taskId} ${fromColumn} done`));
      } else {
        console.error(`❌ Task not found: ${taskId}`);
      }
      break;
      
    case 'log':
    case 'l':
      const message = args.slice(1).join(' ');
      if (!message) {
        console.error('Usage: node mc.js log "Activity message"');
        process.exit(1);
      }
      console.log(runMC(`log-activity "GEX" "logged" "${message}" "blue"`));
      break;
      
    case 'high':
    case 'h':
      console.log(runMC('high-priority'));
      break;
      
    case 'list':
      const column = args[1];
      console.log(runMC(`list-tasks ${column || ''}`));
      break;
      
    case 'start':
    case 'begin':
      const startId = args[1];
      if (!startId) {
        console.error('Usage: node mc.js start <task-id>');
        process.exit(1);
      }
      // Find task and move to inProgress
      const startList = runMC('list-tasks');
      const startLines = startList.split('\n');
      let startFrom = null;
      let startCurrent = null;
      
      for (const line of startLines) {
        if (line.includes('📋')) {
          startCurrent = line.match(/📋 (\w+)/)?.[1];
        }
        if (line.includes(`[${startId}]`)) {
          startFrom = startCurrent;
          break;
        }
      }
      
      if (startFrom) {
        if (startFrom === 'inProgress') {
          console.log('✅ Task already in progress');
        } else {
          console.log(runMC(`move-task ${startId} ${startFrom} inProgress`));
          console.log(runMC(`log-activity "GEX" "started" "${startId}" "blue"`));
        }
      } else {
        console.error(`❌ Task not found: ${startId}`);
      }
      break;
      
    case 'review':
    case 'r':
      const reviewId = args[1];
      if (!reviewId) {
        console.error('Usage: node mc.js review <task-id>');
        process.exit(1);
      }
      console.log(runMC(`move-task ${reviewId} inProgress review`));
      console.log(runMC(`log-activity "GEX" "submitted for review" "${reviewId}" "purple"`));
      break;

    case 'search':
    case 'find':
      const query = args.slice(1).join(' ');
      if (!query) {
        console.error('Usage: node mc.js search "query"');
        process.exit(1);
      }
      console.log(runMC(`search "${query}"`));
      break;
      
    case 'count':
    case 'stats':
      console.log(runMC('count'));
      break;
      
    case 'backup':
      console.log(runMC('backup'));
      break;
      
    case 'api':
      console.log(runMC('api-status'));
      break;
      
    case 'today':
    case 't':
      console.log(runMC('today'));
      break;
      
    case 'week':
    case 'w':
      console.log(runMC('week'));
      break;
      
    case 'priority':
    case 'pri':
      const priId = args[1];
      const priLevel = args[2];
      if (!priId || !priLevel) {
        console.error('Usage: node mc.js priority <task-id> <high|normal|low>');
        process.exit(1);
      }
      // Find task column
      const priList = runMC('list-tasks');
      const priLines = priList.split('\n');
      let priColumn = null;
      let priCurrent = null;
      
      for (const line of priLines) {
        if (line.includes('📋')) {
          priCurrent = line.match(/📋 (\w+)/)?.[1];
        }
        if (line.includes(`[${priId}]`)) {
          priColumn = priCurrent;
          break;
        }
      }
      
      if (priColumn) {
        console.log(runMC(`set-priority ${priId} ${priColumn} ${priLevel}`));
      } else {
        console.error(`❌ Task not found: ${priId}`);
      }
      break;
      
    case 'archive':
      const archiveDays = args[1] || '30';
      console.log(runMC(`archive-done ${archiveDays}`));
      break;
      
    case 'help':
    case '--help':
    case '-h':
      console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🔗 MISSION CONTROL BRIDGE                                               ║
╚══════════════════════════════════════════════════════════════════════════╝

  Access Mission Control directly from GEX.

  Task Workflow:
    node mc.js add "Task title"    # Add task to backlog
    node mc.js start <task-id>     # Move to inProgress
    node mc.js review <task-id>    # Submit for review
    node mc.js done <task-id>      # Mark as complete

  Views:
    node mc.js                     # Summary view
    node mc.js today               # Today's summary
    node mc.js week                # Weekly snapshot
    node mc.js high                # High priority tasks
    node mc.js list [column]       # List tasks in column
    node mc.js search "query"      # Find tasks by title
    node mc.js count               # Task counts per column

  Utilities:
    node mc.js log "message"       # Log activity
    node mc.js priority <id> <lvl> # Set priority (high/normal/low)
    node mc.js archive [days]      # Archive old done tasks
    node mc.js backup              # Create backup
    node mc.js api                 # JSON status

  Aliases: s=summary, a=add, d=done, l=log, h=high, r=review, t=today, w=week
`);
      break;
      
    default:
      console.error(`Unknown action: ${ACTION}`);
      console.error('Run: node mc.js help');
      process.exit(1);
  }
}

main();
