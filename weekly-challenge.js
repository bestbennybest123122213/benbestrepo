#!/usr/bin/env node
/**
 * Weekly Challenge System - Gamification for Lead Management
 * 
 * Make clearing the backlog FUN with weekly rotating challenges,
 * permanent achievements, and personal best tracking.
 * 
 * Commands:
 *   gex challenge             - Show current challenges and progress
 *   gex challenge --achievements - Show earned badges
 *   gex challenge --history   - Past week performance
 *   gex challenge --new       - Preview next week's challenges
 *   gex challenge --log <type> [count] - Log challenge progress
 *   gex challenge --daily     - Show daily mini-challenges
 *   gex challenge --xp        - Show XP and level progress
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DATA_DIR = path.join(__dirname, 'data');
const CHALLENGES_FILE = path.join(DATA_DIR, 'challenges.json');

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m'
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Challenge Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEEKLY_CHALLENGES = {
  speed_demon: {
    id: 'speed_demon',
    name: 'Speed Demon',
    icon: '⚡',
    description: 'Respond to 5 leads within 1 hour of receiving',
    target: 5,
    xpReward: 150,
    difficulty: 'hard'
  },
  booking_blitz: {
    id: 'booking_blitz',
    name: 'Booking Blitz',
    icon: '📅',
    description: 'Book 3 meetings this week',
    target: 3,
    xpReward: 200,
    difficulty: 'medium'
  },
  stale_slayer: {
    id: 'stale_slayer',
    name: 'Stale Slayer',
    icon: '🗡️',
    description: 'Clear 10 stale leads from the pipeline',
    target: 10,
    xpReward: 100,
    difficulty: 'easy'
  },
  hot_streak: {
    id: 'hot_streak',
    name: 'Hot Streak',
    icon: '🔥',
    description: 'Maintain 5-day response streak (respond to at least 1 lead daily)',
    target: 5,
    xpReward: 175,
    difficulty: 'hard'
  },
  pipeline_pusher: {
    id: 'pipeline_pusher',
    name: 'Pipeline Pusher',
    icon: '📈',
    description: 'Move 5 leads forward in the pipeline',
    target: 5,
    xpReward: 125,
    difficulty: 'medium'
  },
  closer_king: {
    id: 'closer_king',
    name: 'Closer King',
    icon: '👑',
    description: 'Close 2 deals this week',
    target: 2,
    xpReward: 300,
    difficulty: 'legendary'
  },
  email_warrior: {
    id: 'email_warrior',
    name: 'Email Warrior',
    icon: '📧',
    description: 'Send 20 personalized follow-ups',
    target: 20,
    xpReward: 100,
    difficulty: 'easy'
  },
  research_master: {
    id: 'research_master',
    name: 'Research Master',
    icon: '🔍',
    description: 'Research and enrich 15 leads',
    target: 15,
    xpReward: 125,
    difficulty: 'medium'
  }
};

const DAILY_CHALLENGES = {
  quick_draw: {
    id: 'quick_draw',
    name: 'Quick Draw',
    icon: '🎯',
    description: 'Respond to a lead within 30 minutes',
    target: 1,
    xpReward: 25
  },
  inbox_zero: {
    id: 'inbox_zero',
    name: 'Inbox Zero',
    icon: '📭',
    description: 'Clear all urgent inbox items',
    target: 1,
    xpReward: 30
  },
  warm_up: {
    id: 'warm_up',
    name: 'Warm Up',
    icon: '☕',
    description: 'Send 3 follow-up emails before 10 AM',
    target: 3,
    xpReward: 20
  },
  power_hour: {
    id: 'power_hour',
    name: 'Power Hour',
    icon: '⏰',
    description: 'Complete 5 lead actions in one hour',
    target: 5,
    xpReward: 35
  },
  clean_sweep: {
    id: 'clean_sweep',
    name: 'Clean Sweep',
    icon: '🧹',
    description: 'Clear 3 stale leads',
    target: 3,
    xpReward: 20
  }
};

const ACHIEVEMENTS = {
  first_blood: {
    id: 'first_blood',
    name: 'First Blood',
    icon: '🔥',
    description: 'Clear your first stale lead',
    condition: 'stale_cleared >= 1',
    xpReward: 50
  },
  speed_demon_badge: {
    id: 'speed_demon_badge',
    name: 'Speed Demon',
    icon: '⚡',
    description: 'Complete the Speed Demon challenge',
    condition: 'speed_demon_completed >= 1',
    xpReward: 100
  },
  weekly_warrior: {
    id: 'weekly_warrior',
    name: 'Weekly Warrior',
    icon: '🏆',
    description: 'Complete all challenges in a single week',
    condition: 'perfect_weeks >= 1',
    xpReward: 500
  },
  century_club: {
    id: 'century_club',
    name: 'Century Club',
    icon: '💯',
    description: 'Clear 100 leads total',
    condition: 'total_leads_cleared >= 100',
    xpReward: 250
  },
  pipeline_king: {
    id: 'pipeline_king',
    name: 'Pipeline King',
    icon: '👑',
    description: 'Maintain 80+ pipeline score for a full week',
    condition: 'high_score_weeks >= 1',
    xpReward: 300
  },
  streak_master: {
    id: 'streak_master',
    name: 'Streak Master',
    icon: '🌟',
    description: 'Maintain a 10-day response streak',
    condition: 'max_streak >= 10',
    xpReward: 200
  },
  booking_boss: {
    id: 'booking_boss',
    name: 'Booking Boss',
    icon: '📅',
    description: 'Book 10 meetings total',
    condition: 'total_meetings >= 10',
    xpReward: 150
  },
  deal_maker: {
    id: 'deal_maker',
    name: 'Deal Maker',
    icon: '💰',
    description: 'Close 5 deals total',
    condition: 'total_deals >= 5',
    xpReward: 400
  },
  level_10: {
    id: 'level_10',
    name: 'Level 10 Legend',
    icon: '🎮',
    description: 'Reach Level 10',
    condition: 'level >= 10',
    xpReward: 500
  }
};

// XP/Level System
const XP_PER_LEVEL = 500;
const LEVEL_TITLES = [
  { level: 1, title: 'Rookie', icon: '🌱' },
  { level: 3, title: 'Hustler', icon: '💪' },
  { level: 5, title: 'Closer', icon: '🎯' },
  { level: 7, title: 'Pipeline Pro', icon: '📈' },
  { level: 10, title: 'Sales Legend', icon: '⭐' },
  { level: 15, title: 'Deal Machine', icon: '🤖' },
  { level: 20, title: 'Pipeline King', icon: '👑' },
  { level: 25, title: 'GEX Master', icon: '🏆' }
];

const CELEBRATION_MESSAGES = [
  '🎉 CHALLENGE COMPLETE! You absolute legend!',
  '🚀 BOOM! Another one bites the dust!',
  '🔥 ON FIRE! Challenge demolished!',
  '⚡ UNSTOPPABLE! Keep that energy!',
  '🏆 CHAMPION MOVES! Nothing can stop you!',
  '💪 BEAST MODE! Challenge crushed!',
  '🎯 BULLSEYE! Perfect execution!',
  '✨ LEGENDARY! That\'s how it\'s done!'
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Data Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getWeekNumber(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getDayOfWeek() {
  return new Date().getDay() || 7; // 1=Mon, 7=Sun
}

function selectWeeklyChallenges(weekNumber) {
  // Deterministically select 3-4 challenges based on week number
  const allChallenges = Object.keys(WEEKLY_CHALLENGES);
  const seed = weekNumber * 7;
  const shuffled = allChallenges.sort((a, b) => {
    const hashA = (seed * a.charCodeAt(0)) % 100;
    const hashB = (seed * b.charCodeAt(0)) % 100;
    return hashA - hashB;
  });
  
  // Always include stale_slayer (most actionable) + 2-3 others
  const selected = ['stale_slayer'];
  for (const challenge of shuffled) {
    if (challenge !== 'stale_slayer' && selected.length < 4) {
      selected.push(challenge);
    }
  }
  return selected;
}

function selectDailyChallenge(date = new Date()) {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  const challenges = Object.keys(DAILY_CHALLENGES);
  return challenges[dayOfYear % challenges.length];
}

function getDefaultData() {
  const weekStart = getWeekStart();
  const weekNumber = getWeekNumber();
  
  return {
    currentWeek: weekStart,
    weekNumber: weekNumber,
    activeChallenges: selectWeeklyChallenges(weekNumber),
    challengeProgress: {},
    dailyProgress: {},
    
    // Lifetime stats
    stats: {
      total_xp: 0,
      level: 1,
      stale_cleared: 0,
      total_leads_cleared: 0,
      total_meetings: 0,
      total_deals: 0,
      fast_responses: 0,
      current_streak: 0,
      max_streak: 0,
      speed_demon_completed: 0,
      perfect_weeks: 0,
      high_score_weeks: 0,
      weeks_played: 0,
      challenges_completed: 0,
      daily_challenges_completed: 0
    },
    
    // Earned achievements
    achievements: [],
    
    // History
    weeklyHistory: [],
    
    // Personal bests
    personalBests: {
      best_week_challenges: 0,
      best_week_xp: 0,
      longest_streak: 0,
      fastest_response_minutes: null,
      most_stale_cleared_week: 0,
      most_meetings_week: 0
    },
    
    // Last activity for streak tracking
    lastActivityDate: null,
    
    // Daily challenge tracking
    todayChallenge: null,
    todayChallengeCompleted: false
  };
}

function loadData() {
  ensureDataDir();
  try {
    if (fs.existsSync(CHALLENGES_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHALLENGES_FILE, 'utf8'));
      const currentWeek = getWeekStart();
      
      // Check for new week
      if (data.currentWeek !== currentWeek) {
        return initNewWeek(data);
      }
      
      // Check for new day
      const today = getToday();
      if (data.lastDailyCheck !== today) {
        data.lastDailyCheck = today;
        data.todayChallenge = selectDailyChallenge();
        data.todayChallengeCompleted = false;
        data.dailyProgress[data.todayChallenge] = 0;
        saveData(data);
      }
      
      return data;
    }
  } catch (e) {
    console.error('Error loading challenges:', e.message);
  }
  
  const newData = getDefaultData();
  newData.lastDailyCheck = getToday();
  newData.todayChallenge = selectDailyChallenge();
  saveData(newData);
  return newData;
}

function initNewWeek(oldData) {
  // Archive the old week
  const weekSummary = {
    week: oldData.currentWeek,
    weekNumber: oldData.weekNumber,
    challenges: oldData.activeChallenges,
    progress: { ...oldData.challengeProgress },
    completed: countCompletedChallenges(oldData),
    total: oldData.activeChallenges.length,
    xpEarned: calculateWeekXP(oldData)
  };
  
  // Check for perfect week achievement
  if (weekSummary.completed === weekSummary.total) {
    oldData.stats.perfect_weeks = (oldData.stats.perfect_weeks || 0) + 1;
  }
  
  // Update personal bests
  if (weekSummary.completed > (oldData.personalBests?.best_week_challenges || 0)) {
    oldData.personalBests = oldData.personalBests || {};
    oldData.personalBests.best_week_challenges = weekSummary.completed;
  }
  
  if (weekSummary.xpEarned > (oldData.personalBests?.best_week_xp || 0)) {
    oldData.personalBests = oldData.personalBests || {};
    oldData.personalBests.best_week_xp = weekSummary.xpEarned;
  }
  
  // Start new week
  const weekStart = getWeekStart();
  const weekNumber = getWeekNumber();
  
  const newData = {
    ...oldData,
    currentWeek: weekStart,
    weekNumber: weekNumber,
    activeChallenges: selectWeeklyChallenges(weekNumber),
    challengeProgress: {},
    dailyProgress: {},
    todayChallenge: selectDailyChallenge(),
    todayChallengeCompleted: false,
    lastDailyCheck: getToday(),
    weeklyHistory: [...(oldData.weeklyHistory || []), weekSummary].slice(-12) // Keep 12 weeks
  };
  
  newData.stats.weeks_played = (newData.stats.weeks_played || 0) + 1;
  
  saveData(newData);
  return newData;
}

function saveData(data) {
  ensureDataDir();
  fs.writeFileSync(CHALLENGES_FILE, JSON.stringify(data, null, 2));
}

function countCompletedChallenges(data) {
  let count = 0;
  for (const challengeId of data.activeChallenges) {
    const challenge = WEEKLY_CHALLENGES[challengeId];
    const progress = data.challengeProgress[challengeId] || 0;
    if (challenge && progress >= challenge.target) {
      count++;
    }
  }
  return count;
}

function calculateWeekXP(data) {
  let xp = 0;
  for (const challengeId of data.activeChallenges) {
    const challenge = WEEKLY_CHALLENGES[challengeId];
    const progress = data.challengeProgress[challengeId] || 0;
    if (challenge && progress >= challenge.target) {
      xp += challenge.xpReward;
    }
  }
  return xp;
}

function calculateLevel(totalXP) {
  return Math.floor(totalXP / XP_PER_LEVEL) + 1;
}

function getTitle(level) {
  let title = LEVEL_TITLES[0];
  for (const t of LEVEL_TITLES) {
    if (level >= t.level) {
      title = t;
    }
  }
  return title;
}

function checkAchievements(data) {
  const newlyUnlocked = [];
  
  for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
    if (data.achievements.includes(id)) continue;
    
    // Parse condition
    let unlocked = false;
    const stats = data.stats;
    
    if (id === 'first_blood' && stats.stale_cleared >= 1) unlocked = true;
    if (id === 'speed_demon_badge' && stats.speed_demon_completed >= 1) unlocked = true;
    if (id === 'weekly_warrior' && stats.perfect_weeks >= 1) unlocked = true;
    if (id === 'century_club' && stats.total_leads_cleared >= 100) unlocked = true;
    if (id === 'pipeline_king' && stats.high_score_weeks >= 1) unlocked = true;
    if (id === 'streak_master' && stats.max_streak >= 10) unlocked = true;
    if (id === 'booking_boss' && stats.total_meetings >= 10) unlocked = true;
    if (id === 'deal_maker' && stats.total_deals >= 5) unlocked = true;
    if (id === 'level_10' && stats.level >= 10) unlocked = true;
    
    if (unlocked) {
      data.achievements.push(id);
      data.stats.total_xp += achievement.xpReward;
      newlyUnlocked.push(achievement);
    }
  }
  
  // Update level
  data.stats.level = calculateLevel(data.stats.total_xp);
  
  return newlyUnlocked;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Display Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function progressBar(current, target, width = 20) {
  const percent = Math.min(current / target, 1);
  const filled = Math.round(width * percent);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percentText = Math.round(percent * 100);
  
  if (percent >= 1) {
    return `${c.green}${bar}${c.reset} ${c.green}✓${c.reset}`;
  } else if (percent >= 0.5) {
    return `${c.yellow}${bar}${c.reset} ${percentText}%`;
  } else {
    return `${c.dim}${bar}${c.reset} ${percentText}%`;
  }
}

function difficultyBadge(difficulty) {
  const badges = {
    easy: `${c.green}[EASY]${c.reset}`,
    medium: `${c.yellow}[MEDIUM]${c.reset}`,
    hard: `${c.red}[HARD]${c.reset}`,
    legendary: `${c.magenta}${c.bold}[LEGENDARY]${c.reset}`
  };
  return badges[difficulty] || '';
}

function showChallenges(data) {
  const dayOfWeek = getDayOfWeek();
  const daysLeft = 7 - dayOfWeek + 1;
  const title = getTitle(data.stats.level);
  
  console.log(`\n${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║${c.reset}  ${c.bold}🎮 WEEKLY CHALLENGES${c.reset}  ${c.dim}Week ${data.weekNumber}${c.reset}                            ${c.cyan}║${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚════════════════════════════════════════════════════════════╝${c.reset}\n`);
  
  // Player stats bar
  const xpInLevel = data.stats.total_xp % XP_PER_LEVEL;
  const levelProgress = progressBar(xpInLevel, XP_PER_LEVEL, 15);
  console.log(`  ${title.icon} ${c.bold}${title.title}${c.reset} (Lv.${data.stats.level})  ${levelProgress}  ${c.dim}${xpInLevel}/${XP_PER_LEVEL} XP${c.reset}`);
  console.log(`  ${c.dim}${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining this week${c.reset}\n`);
  
  console.log(`${c.bold}  Active Challenges:${c.reset}\n`);
  
  let completedCount = 0;
  for (const challengeId of data.activeChallenges) {
    const challenge = WEEKLY_CHALLENGES[challengeId];
    if (!challenge) continue;
    
    const progress = data.challengeProgress[challengeId] || 0;
    const isComplete = progress >= challenge.target;
    if (isComplete) completedCount++;
    
    const statusIcon = isComplete ? '✅' : '⬜';
    const bar = progressBar(progress, challenge.target);
    const diff = difficultyBadge(challenge.difficulty);
    
    console.log(`  ${statusIcon} ${challenge.icon} ${c.bold}${challenge.name}${c.reset} ${diff}`);
    console.log(`     ${c.dim}${challenge.description}${c.reset}`);
    console.log(`     ${bar}  ${progress}/${challenge.target}  ${c.dim}+${challenge.xpReward} XP${c.reset}`);
    console.log();
  }
  
  // Check if all complete
  if (completedCount === data.activeChallenges.length) {
    console.log(`  ${c.green}${c.bold}🏆 ALL CHALLENGES COMPLETE! LEGENDARY WEEK! 🏆${c.reset}\n`);
  }
  
  // Personal best motivation
  const bestWeek = data.personalBests?.best_week_challenges || 0;
  if (completedCount > 0 && completedCount >= bestWeek && bestWeek > 0) {
    console.log(`  ${c.yellow}⭐ Matching your personal best! (${bestWeek} challenges)${c.reset}\n`);
  } else if (completedCount > 0 && completedCount < bestWeek) {
    const toGo = bestWeek - completedCount;
    console.log(`  ${c.dim}📊 ${toGo} more to beat your record of ${bestWeek} challenges${c.reset}\n`);
  }
  
  // Quick actions hint
  console.log(`${c.dim}  💡 Log progress: gex challenge --log stale 3${c.reset}`);
  console.log(`${c.dim}     Types: stale, meeting, response, streak, forward, deal, email, research${c.reset}\n`);
}

function showDailyChallenge(data) {
  const challengeId = data.todayChallenge;
  const challenge = DAILY_CHALLENGES[challengeId];
  
  if (!challenge) {
    console.log(`\n${c.dim}  No daily challenge available${c.reset}\n`);
    return;
  }
  
  const progress = data.dailyProgress[challengeId] || 0;
  const isComplete = data.todayChallengeCompleted || progress >= challenge.target;
  
  console.log(`\n${c.bold}${c.magenta}╔════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}║${c.reset}  ${c.bold}⏰ TODAY'S MINI-CHALLENGE${c.reset}                                  ${c.magenta}║${c.reset}`);
  console.log(`${c.bold}${c.magenta}╚════════════════════════════════════════════════════════════╝${c.reset}\n`);
  
  const statusIcon = isComplete ? '✅' : '⬜';
  const bar = progressBar(progress, challenge.target, 25);
  
  console.log(`  ${statusIcon} ${challenge.icon} ${c.bold}${challenge.name}${c.reset}`);
  console.log(`     ${c.dim}${challenge.description}${c.reset}`);
  console.log(`     ${bar}  ${progress}/${challenge.target}  ${c.dim}+${challenge.xpReward} XP${c.reset}`);
  
  if (isComplete) {
    console.log(`\n  ${c.green}${c.bold}🎉 Daily challenge complete! Come back tomorrow!${c.reset}`);
  }
  
  console.log();
}

function showAchievements(data) {
  console.log(`\n${c.bold}${c.yellow}╔════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.yellow}║${c.reset}  ${c.bold}🏆 ACHIEVEMENT SHOWCASE${c.reset}                                    ${c.yellow}║${c.reset}`);
  console.log(`${c.bold}${c.yellow}╚════════════════════════════════════════════════════════════╝${c.reset}\n`);
  
  const earned = data.achievements || [];
  
  console.log(`${c.bold}  Earned Badges (${earned.length}/${Object.keys(ACHIEVEMENTS).length}):${c.reset}\n`);
  
  for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
    const isEarned = earned.includes(id);
    
    if (isEarned) {
      console.log(`  ${achievement.icon} ${c.bold}${c.green}${achievement.name}${c.reset}`);
      console.log(`     ${c.dim}${achievement.description}${c.reset}`);
      console.log(`     ${c.green}✓ Unlocked${c.reset}  ${c.dim}+${achievement.xpReward} XP${c.reset}`);
    } else {
      console.log(`  ${c.dim}🔒 ${achievement.name}${c.reset}`);
      console.log(`     ${c.dim}${achievement.description}${c.reset}`);
      console.log(`     ${c.dim}Locked  +${achievement.xpReward} XP${c.reset}`);
    }
    console.log();
  }
  
  // Stats that contribute to achievements
  console.log(`${c.bold}  Progress Toward Locked:${c.reset}\n`);
  const stats = data.stats;
  console.log(`  📊 Stale leads cleared: ${stats.stale_cleared || 0}`);
  console.log(`  📊 Total leads cleared: ${stats.total_leads_cleared || 0}/100`);
  console.log(`  📊 Meetings booked: ${stats.total_meetings || 0}/10`);
  console.log(`  📊 Deals closed: ${stats.total_deals || 0}/5`);
  console.log(`  📊 Best streak: ${stats.max_streak || 0}/10 days`);
  console.log(`  📊 Perfect weeks: ${stats.perfect_weeks || 0}`);
  console.log();
}

function showHistory(data) {
  console.log(`\n${c.bold}${c.blue}╔════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.blue}║${c.reset}  ${c.bold}📅 WEEKLY HISTORY${c.reset}                                          ${c.blue}║${c.reset}`);
  console.log(`${c.bold}${c.blue}╚════════════════════════════════════════════════════════════╝${c.reset}\n`);
  
  const history = data.weeklyHistory || [];
  
  if (history.length === 0) {
    console.log(`  ${c.dim}No completed weeks yet. Keep grinding!${c.reset}\n`);
    return;
  }
  
  console.log(`${c.bold}  Past Weeks:${c.reset}\n`);
  
  for (const week of history.slice().reverse()) {
    const isPerfect = week.completed === week.total;
    const stars = '⭐'.repeat(week.completed) + '☆'.repeat(week.total - week.completed);
    
    console.log(`  📅 Week ${week.weekNumber} (${week.week})`);
    console.log(`     ${stars}  ${week.completed}/${week.total} challenges`);
    console.log(`     ${c.dim}+${week.xpEarned} XP earned${c.reset}`);
    if (isPerfect) {
      console.log(`     ${c.green}🏆 PERFECT WEEK!${c.reset}`);
    }
    console.log();
  }
  
  // Personal bests
  console.log(`${c.bold}  Personal Bests:${c.reset}\n`);
  const pb = data.personalBests || {};
  console.log(`  🏆 Best week: ${pb.best_week_challenges || 0} challenges`);
  console.log(`  ⚡ Most XP in a week: ${pb.best_week_xp || 0} XP`);
  console.log(`  🔥 Longest streak: ${pb.longest_streak || data.stats?.max_streak || 0} days`);
  console.log(`  🗡️ Most stale cleared (week): ${pb.most_stale_cleared_week || 0}`);
  console.log(`  📅 Most meetings (week): ${pb.most_meetings_week || 0}`);
  console.log();
}

function showNextWeek(data) {
  const nextWeekNumber = data.weekNumber + 1;
  const nextChallenges = selectWeeklyChallenges(nextWeekNumber);
  
  console.log(`\n${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║${c.reset}  ${c.bold}🔮 NEXT WEEK PREVIEW${c.reset}  ${c.dim}Week ${nextWeekNumber}${c.reset}                           ${c.cyan}║${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚════════════════════════════════════════════════════════════╝${c.reset}\n`);
  
  console.log(`${c.bold}  Coming Challenges:${c.reset}\n`);
  
  for (const challengeId of nextChallenges) {
    const challenge = WEEKLY_CHALLENGES[challengeId];
    if (!challenge) continue;
    
    const diff = difficultyBadge(challenge.difficulty);
    console.log(`  ${challenge.icon} ${c.bold}${challenge.name}${c.reset} ${diff}`);
    console.log(`     ${c.dim}${challenge.description}${c.reset}`);
    console.log(`     Target: ${challenge.target}  ${c.dim}+${challenge.xpReward} XP${c.reset}`);
    console.log();
  }
  
  console.log(`  ${c.dim}New challenges unlock Monday at midnight!${c.reset}\n`);
}

function showXP(data) {
  const title = getTitle(data.stats.level);
  const xpInLevel = data.stats.total_xp % XP_PER_LEVEL;
  const xpToNext = XP_PER_LEVEL - xpInLevel;
  
  console.log(`\n${c.bold}${c.magenta}╔════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}║${c.reset}  ${c.bold}✨ XP & LEVEL PROGRESS${c.reset}                                    ${c.magenta}║${c.reset}`);
  console.log(`${c.bold}${c.magenta}╚════════════════════════════════════════════════════════════╝${c.reset}\n`);
  
  console.log(`  ${title.icon} ${c.bold}${title.title}${c.reset}`);
  console.log(`  Level ${data.stats.level}\n`);
  
  const bar = progressBar(xpInLevel, XP_PER_LEVEL, 30);
  console.log(`  ${bar}`);
  console.log(`  ${c.bold}${data.stats.total_xp}${c.reset} Total XP  |  ${c.dim}${xpToNext} XP to Level ${data.stats.level + 1}${c.reset}\n`);
  
  // Show all titles
  console.log(`${c.bold}  Title Progression:${c.reset}\n`);
  for (const t of LEVEL_TITLES) {
    const unlocked = data.stats.level >= t.level;
    if (unlocked) {
      console.log(`  ${t.icon} ${c.green}${t.title}${c.reset} ${c.dim}(Level ${t.level})${c.reset}`);
    } else {
      console.log(`  ${c.dim}🔒 ${t.title} (Level ${t.level})${c.reset}`);
    }
  }
  console.log();
  
  // XP breakdown
  console.log(`${c.bold}  XP Sources:${c.reset}\n`);
  console.log(`  📊 Challenges completed: ${data.stats.challenges_completed || 0}`);
  console.log(`  ⏰ Daily challenges: ${data.stats.daily_challenges_completed || 0}`);
  console.log(`  🏆 Achievements: ${data.achievements?.length || 0}`);
  console.log();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Action Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function logProgress(data, type, count = 1) {
  count = parseInt(count) || 1;
  
  const typeMap = {
    'stale': { challenges: ['stale_slayer'], stat: 'stale_cleared', daily: 'clean_sweep' },
    'meeting': { challenges: ['booking_blitz'], stat: 'total_meetings', daily: null },
    'response': { challenges: ['speed_demon'], stat: 'fast_responses', daily: 'quick_draw' },
    'streak': { challenges: ['hot_streak'], stat: 'current_streak', daily: null },
    'forward': { challenges: ['pipeline_pusher'], stat: null, daily: null },
    'deal': { challenges: ['closer_king'], stat: 'total_deals', daily: null },
    'email': { challenges: ['email_warrior'], stat: null, daily: 'warm_up' },
    'research': { challenges: ['research_master'], stat: null, daily: null },
    'action': { challenges: [], stat: null, daily: 'power_hour' }
  };
  
  const mapping = typeMap[type];
  if (!mapping) {
    console.log(`\n${c.red}❌ Unknown type: ${type}${c.reset}`);
    console.log(`${c.dim}   Valid types: stale, meeting, response, streak, forward, deal, email, research, action${c.reset}\n`);
    return;
  }
  
  let xpEarned = 0;
  const completedChallenges = [];
  const completedDaily = [];
  
  // Update weekly challenge progress
  for (const challengeId of mapping.challenges) {
    if (data.activeChallenges.includes(challengeId)) {
      const challenge = WEEKLY_CHALLENGES[challengeId];
      const before = data.challengeProgress[challengeId] || 0;
      data.challengeProgress[challengeId] = before + count;
      
      // Check if just completed
      if (before < challenge.target && data.challengeProgress[challengeId] >= challenge.target) {
        xpEarned += challenge.xpReward;
        data.stats.challenges_completed = (data.stats.challenges_completed || 0) + 1;
        completedChallenges.push(challenge);
        
        // Track Speed Demon completions for achievement
        if (challengeId === 'speed_demon') {
          data.stats.speed_demon_completed = (data.stats.speed_demon_completed || 0) + 1;
        }
      }
    }
  }
  
  // Update daily challenge
  if (mapping.daily && data.todayChallenge === mapping.daily && !data.todayChallengeCompleted) {
    const dailyChallenge = DAILY_CHALLENGES[mapping.daily];
    const before = data.dailyProgress[mapping.daily] || 0;
    data.dailyProgress[mapping.daily] = before + count;
    
    if (data.dailyProgress[mapping.daily] >= dailyChallenge.target) {
      xpEarned += dailyChallenge.xpReward;
      data.todayChallengeCompleted = true;
      data.stats.daily_challenges_completed = (data.stats.daily_challenges_completed || 0) + 1;
      completedDaily.push(dailyChallenge);
    }
  }
  
  // Update lifetime stats
  if (mapping.stat) {
    data.stats[mapping.stat] = (data.stats[mapping.stat] || 0) + count;
  }
  
  // Always increment total_leads_cleared for lead-related actions
  if (['stale', 'forward', 'response'].includes(type)) {
    data.stats.total_leads_cleared = (data.stats.total_leads_cleared || 0) + count;
  }
  
  // Update streak
  if (type === 'streak' || type === 'response') {
    data.stats.current_streak = (data.stats.current_streak || 0) + count;
    if (data.stats.current_streak > (data.stats.max_streak || 0)) {
      data.stats.max_streak = data.stats.current_streak;
    }
    if (data.stats.current_streak > (data.personalBests?.longest_streak || 0)) {
      data.personalBests = data.personalBests || {};
      data.personalBests.longest_streak = data.stats.current_streak;
    }
  }
  
  // Add XP and update level
  data.stats.total_xp = (data.stats.total_xp || 0) + xpEarned;
  const oldLevel = data.stats.level || 1;
  data.stats.level = calculateLevel(data.stats.total_xp);
  const leveledUp = data.stats.level > oldLevel;
  
  // Check for new achievements
  const newAchievements = checkAchievements(data);
  
  // Update last activity
  data.lastActivityDate = getToday();
  
  saveData(data);
  
  // Show feedback
  console.log(`\n${c.green}✓ Logged ${count} ${type}${count > 1 ? 's' : ''}${c.reset}`);
  
  if (xpEarned > 0) {
    console.log(`  ${c.yellow}+${xpEarned} XP${c.reset}`);
  }
  
  // Celebrations
  for (const challenge of completedChallenges) {
    const msg = CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)];
    console.log(`\n${c.bold}${c.green}${msg}${c.reset}`);
    console.log(`  ${challenge.icon} ${c.bold}${challenge.name}${c.reset} complete!`);
  }
  
  for (const challenge of completedDaily) {
    console.log(`\n${c.magenta}⏰ Daily challenge complete: ${challenge.icon} ${challenge.name}${c.reset}`);
  }
  
  if (leveledUp) {
    const title = getTitle(data.stats.level);
    console.log(`\n${c.bold}${c.yellow}🎉 LEVEL UP! You are now Level ${data.stats.level}!${c.reset}`);
    console.log(`   ${title.icon} ${c.bold}${title.title}${c.reset}`);
  }
  
  for (const achievement of newAchievements) {
    console.log(`\n${c.bold}${c.yellow}🏆 ACHIEVEMENT UNLOCKED: ${achievement.icon} ${achievement.name}${c.reset}`);
    console.log(`   ${c.dim}${achievement.description}${c.reset}`);
  }
  
  console.log();
}

function showHelp() {
  console.log(`
${c.bold}🎮 Weekly Challenge System${c.reset}

${c.bold}Commands:${c.reset}
  gex challenge              Show current challenges and progress
  gex challenge --daily      Show today's mini-challenge
  gex challenge --achievements  Show earned badges
  gex challenge --history    Past week performance
  gex challenge --new        Preview next week's challenges
  gex challenge --xp         Show XP and level progress
  gex challenge --status     One-line quick status
  gex challenge --log <type> [count]  Log challenge progress
  gex challenge --reset      Reset all progress (testing)

${c.bold}Log Types:${c.reset}
  stale     - Cleared a stale lead
  meeting   - Booked a meeting
  response  - Fast response (<1 hour)
  streak    - Maintained daily activity
  forward   - Moved lead forward in pipeline
  deal      - Closed a deal
  email     - Sent personalized email
  research  - Researched/enriched a lead
  action    - Completed a lead action

${c.bold}Examples:${c.reset}
  gex challenge --log stale 3    Log 3 stale leads cleared
  gex challenge --log meeting    Log 1 meeting booked
  gex challenge --log deal 1     Log 1 deal closed

${c.bold}Aliases:${c.reset}
  gex challenges, gex weekly-challenge
`);
}

function showQuickStatus(data) {
  const completed = countCompletedChallenges(data);
  const total = data.activeChallenges.length;
  const title = getTitle(data.stats.level);
  const dailyDone = data.todayChallengeCompleted ? '✓' : '○';
  
  console.log(`${title.icon} Lv.${data.stats.level} ${title.title} | Weekly: ${completed}/${total} | Daily: ${dailyDone} | XP: ${data.stats.total_xp} | 🏆 ${data.achievements.length}`);
}

function resetData() {
  const newData = getDefaultData();
  newData.lastDailyCheck = getToday();
  newData.todayChallenge = selectDailyChallenge();
  saveData(newData);
  console.log(`\n${c.green}✓ Challenge data reset!${c.reset}`);
  console.log(`${c.dim}  Fresh start - good luck!${c.reset}\n`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  const args = process.argv.slice(2);
  
  // Parse flags
  const showAchievementsFlag = args.includes('--achievements') || args.includes('-a');
  const showHistoryFlag = args.includes('--history') || args.includes('-h');
  const showNewFlag = args.includes('--new') || args.includes('-n');
  const showDailyFlag = args.includes('--daily') || args.includes('-d');
  const showXPFlag = args.includes('--xp') || args.includes('-x');
  const showStatusFlag = args.includes('--status') || args.includes('-s');
  const showHelpFlag = args.includes('--help') || args.includes('help');
  const showResetFlag = args.includes('--reset');
  const logIndex = args.indexOf('--log');
  
  if (showHelpFlag) {
    showHelp();
    return;
  }
  
  if (showResetFlag) {
    resetData();
    return;
  }
  
  const data = loadData();
  
  if (logIndex !== -1) {
    const type = args[logIndex + 1];
    const count = args[logIndex + 2] || 1;
    if (!type) {
      console.log(`\n${c.red}❌ Please specify a type: gex challenge --log <type> [count]${c.reset}\n`);
      return;
    }
    logProgress(data, type, count);
    return;
  }
  
  if (showStatusFlag) {
    showQuickStatus(data);
    return;
  }
  
  if (showAchievementsFlag) {
    showAchievements(data);
    return;
  }
  
  if (showHistoryFlag) {
    showHistory(data);
    return;
  }
  
  if (showNewFlag) {
    showNextWeek(data);
    return;
  }
  
  if (showDailyFlag) {
    showDailyChallenge(data);
    return;
  }
  
  if (showXPFlag) {
    showXP(data);
    return;
  }
  
  // Default: show current challenges
  showChallenges(data);
}

main().catch(console.error);
