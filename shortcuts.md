# GEX Keyboard Shortcuts & Aliases

Quick reference for all shortcuts in the GEX ecosystem.

## CLI Aliases

| Alias | Full Command | Description |
|-------|-------------|-------------|
| `s` | status | Quick check |
| `p` | pulse | One-line status |
| `d` | daily | Full daily routine |
| `r` | rank | Lead ranking |
| `e` | export | Export data |
| `h` | health | Pipeline health |
| `g` | goals | Goal progress |
| `t` | templates | Email templates |
| `f` | fast | Hot lead responses |
| `i` | inbox | Priority inbox |
| `n` | nba | Next best action |
| `w` | winrate | Win rate analysis |

## Dashboard Keyboard Shortcuts

### Main Dashboard (localhost:3456)
| Key | Action |
|-----|--------|
| `⌘K` / `Ctrl+K` | Command palette |
| `G H` | Go to Home |
| `G L` | Go to Leads |
| `G B` | Go to Bookings |
| `R` | Refresh data |
| `/` | Focus search |
| `?` | Show help |

### Mobile Dashboard
| Key | Action |
|-----|--------|
| Pull down | Refresh |
| Swipe | Navigate |

## Mission Control Shortcuts

### Dashboard (index.html)
| Key | Action |
|-----|--------|
| `/` | Search tasks |
| `R` | Refresh |
| `1` | Show all |
| `2` | High priority |
| `Esc` | Clear search |
| `?` | Show help |

### CLI Shortcuts
```bash
# Quick summary
./update.sh summary

# Quick search
./update.sh search "keyword"

# High priority only
./update.sh high-priority

# API status (JSON)
./update.sh api-status
```

## Combined Status

```bash
# All systems status
./status-all.sh

# Health check
./health-check.sh
```

## Daily Workflow Shortcuts

```bash
# Morning routine
node gex.js start

# Quick check
node gex.js p

# Today's actions
node gex.js nba

# End of day
node gex.js recent
```

---
*Keep this open as a quick reference!*
