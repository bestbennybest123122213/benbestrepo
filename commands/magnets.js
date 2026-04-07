#!/usr/bin/env node
/**
 * Lead Magnet Generator
 * Generate personalized lead magnet emails based on Eric's framework
 * "17 out of 20 best campaigns offered something free"
 * 
 * Usage:
 *   node gex.js magnets                    - List all templates
 *   node gex.js magnets gaming             - Show gaming-specific templates
 *   node gex.js magnets generate <type>    - Generate email with prompts
 *   node gex.js magnets fill <type> <json> - Fill template with data
 */

const { LEAD_MAGNETS, GAMING_TEMPLATES, EDUCATION_TEMPLATES, fillTemplate, getTemplate, listTemplates } = require('../templates/lead-magnets');

function showTemplateList() {
  console.log('');
  console.log('🎁 \x1b[1mLEAD MAGNET TEMPLATES\x1b[0m');
  console.log('   "17 out of 20 best campaigns offered something free" - Eric');
  console.log('');
  
  const templates = listTemplates();
  
  console.log('\x1b[1mTIER 1: TANGIBLE (Highest Value)\x1b[0m');
  console.log('');
  templates.tier1.forEach(t => {
    console.log(`   📦 \x1b[1m${t.name}\x1b[0m (${t.key})`);
    console.log(`      Prep: ${t.prep_time} | Value: ${t.value}`);
    console.log(`      ${t.description}`);
    console.log('');
  });
  
  console.log('\x1b[1mTIER 2: INTANGIBLE (No Prep Required)\x1b[0m');
  console.log('');
  templates.tier2.forEach(t => {
    console.log(`   💡 \x1b[1m${t.name}\x1b[0m (${t.key})`);
    console.log(`      Prep: ${t.prep_time} | Value: ${t.value}`);
    console.log(`      ${t.description}`);
    console.log('');
  });
  
  console.log('\x1b[1mTIER 3: CASE STUDY\x1b[0m');
  console.log('');
  templates.tier3.forEach(t => {
    console.log(`   📊 \x1b[1m${t.name}\x1b[0m (${t.key})`);
    console.log(`      Prep: ${t.prep_time} | Value: ${t.value}`);
    console.log(`      ${t.description}`);
    console.log('');
  });
  
  console.log('\x1b[1mVERTICAL-SPECIFIC\x1b[0m');
  console.log('');
  console.log('   🎮 Gaming:');
  templates.gaming.forEach(t => {
    console.log(`      • ${t.name} (${t.key})`);
  });
  console.log('');
  console.log('   📚 Education:');
  templates.education.forEach(t => {
    console.log(`      • ${t.name} (${t.key})`);
  });
  console.log('');
}

function showTemplate(key) {
  const template = getTemplate(key);
  if (!template) {
    console.log(`\x1b[31m❌ Template "${key}" not found\x1b[0m`);
    return;
  }
  
  console.log('');
  console.log(`📧 \x1b[1m${template.name}\x1b[0m`);
  console.log('');
  if (template.tier) {
    console.log(`   Tier: ${template.tier} | Prep: ${template.prep_time} | Value: ${template.value}`);
  }
  console.log('');
  console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
  console.log('');
  console.log(template.template);
  console.log('');
  console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
  console.log('');
  if (template.variables) {
    console.log('   Variables: ' + template.variables.join(', '));
  }
  console.log('');
}

function generateEmail(key, data) {
  const template = getTemplate(key);
  if (!template) {
    console.log(`\x1b[31m❌ Template "${key}" not found\x1b[0m`);
    return;
  }
  
  const filled = fillTemplate(template.template, data);
  
  console.log('');
  console.log(`📧 \x1b[1mGENERATED EMAIL: ${template.name}\x1b[0m`);
  console.log('');
  console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
  console.log('');
  console.log(filled);
  console.log('');
  console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
  console.log('');
  console.log('\x1b[32m✓ Ready to copy\x1b[0m');
  console.log('');
}

function showQuickExamples() {
  console.log('');
  console.log('⚡ \x1b[1mQUICK EXAMPLES\x1b[0m');
  console.log('');
  
  // Gaming example
  console.log('\x1b[1m🎮 GAMING LEAD (Mobile Game Studio)\x1b[0m');
  console.log('');
  const gamingEmail = fillTemplate(GAMING_TEMPLATES.whiteout_case_study.template, {
    first_name: 'Sarah',
    company: 'Supercell'
  });
  console.log(gamingEmail);
  console.log('');
  
  // Education example
  console.log('\x1b[1m📚 EDUCATION LEAD (EdTech App)\x1b[0m');
  console.log('');
  const eduEmail = fillTemplate(EDUCATION_TEMPLATES.gauth_case_study.template, {
    first_name: 'Mike',
    company: 'Duolingo'
  });
  console.log(eduEmail);
  console.log('');
  
  // Strategy session (no prep)
  console.log('\x1b[1m💡 ZERO-PREP OPTION (Any Vertical)\x1b[0m');
  console.log('');
  const strategyEmail = fillTemplate(LEAD_MAGNETS.strategy_session.template, {
    first_name: 'Alex',
    company: 'Notion',
    vertical: 'productivity'
  });
  console.log(strategyEmail);
  console.log('');
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== 'magnets' && a !== 'leadmag');
  
  if (args.length === 0) {
    showTemplateList();
    console.log('\x1b[2m💡 Use: magnets <template_key> to see full template\x1b[0m');
    console.log('\x1b[2m💡 Use: magnets examples for ready-to-send examples\x1b[0m');
    console.log('');
    return;
  }
  
  const command = args[0].toLowerCase();
  
  if (command === 'examples' || command === 'quick') {
    showQuickExamples();
    return;
  }
  
  if (command === 'gaming') {
    console.log('');
    console.log('🎮 \x1b[1mGAMING TEMPLATES\x1b[0m');
    console.log('');
    Object.entries(GAMING_TEMPLATES).forEach(([key, t]) => {
      console.log(`   \x1b[1m${t.name}\x1b[0m (${key})`);
      console.log('');
      console.log(t.template);
      console.log('');
      console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
      console.log('');
    });
    return;
  }
  
  if (command === 'education' || command === 'edu') {
    console.log('');
    console.log('📚 \x1b[1mEDUCATION TEMPLATES\x1b[0m');
    console.log('');
    Object.entries(EDUCATION_TEMPLATES).forEach(([key, t]) => {
      console.log(`   \x1b[1m${t.name}\x1b[0m (${key})`);
      console.log('');
      console.log(t.template);
      console.log('');
      console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
      console.log('');
    });
    return;
  }
  
  if (command === 'generate' || command === 'gen') {
    const templateKey = args[1];
    if (!templateKey) {
      console.log('\x1b[33m⚠️  Specify template: magnets generate <template_key>\x1b[0m');
      return;
    }
    
    // Try to parse JSON data from args
    const jsonStr = args.slice(2).join(' ');
    if (jsonStr) {
      try {
        const data = JSON.parse(jsonStr);
        generateEmail(templateKey, data);
      } catch (e) {
        console.log('\x1b[31m❌ Invalid JSON. Use: magnets generate template_key \'{"first_name":"John"}\'\x1b[0m');
      }
    } else {
      showTemplate(templateKey);
    }
    return;
  }
  
  // Default: show specific template
  showTemplate(command);
}

main().catch(console.error);
