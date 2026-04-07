#!/usr/bin/env node
/**
 * Getting Started Guide
 * 
 * Shows a quick start guide for new users.
 */

const fs = require('fs');
const path = require('path');

const guidePath = path.join(__dirname, 'GETTING-STARTED.md');

if (fs.existsSync(guidePath)) {
  const content = fs.readFileSync(guidePath, 'utf8');
  console.log(content);
} else {
  console.log(`
🚀 QUICK START

1. Morning routine:     gex routine
2. Ready-to-send:       gex queue
3. Mark as done:        gex qm done 1,2,3
4. Visual dashboard:    gex dashboard --open

For full guide, see: NEW-TOOLS.md
`);
}
