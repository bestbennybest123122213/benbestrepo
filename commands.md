# GEX Command Reference

Complete list of all GEX CLI commands organized by category.

## Getting Started
| Command | Description |
|---------|-------------|
| `setup` | First-time setup wizard |
| `doctor` | Check configuration |
| `validate` | Full system check |
| `version` | Version info |
| `help` | Show help |

## Daily Operations
| Command | Description |
|---------|-------------|
| `status` / `s` | Quick status |
| `pulse` / `p` | One-line status |
| `today` | Today's overview |
| `start` | Morning routine |
| `daily` / `d` | Full daily routine |
| `planner` | Action plan |
| `brief` | Morning summary |
| `exec` | Executive view |
| `weekly` | Weekly report |
| `digest` | Telegram format |
| `morning` | Morning briefing |
| `recent` | Recent activity |
| `watch` | Live monitor |

## Lead Management
| Command | Description |
|---------|-------------|
| `rank` / `r` | Lead ranking |
| `closer` | Meeting closer |
| `prep` | Meeting prep |
| `drafts` | Email drafts |
| `calendar` | Booking msgs |
| `mark` | Update status |
| `schedule` | Smart timing |
| `templates` / `t` | Email library |
| `reactivate` | Cold leads |
| `fast` / `f` | Hot leads |
| `inbox` / `i` | Priority inbox |
| `nba` / `n` | Next best action |
| `score` | Lead scoring |
| `notes` | Lead notes |

## Analytics
| Command | Description |
|---------|-------------|
| `pscore` | Pipeline health score (0-100) |
| `plan` | Score improvement plan |
| `decay` | Lead decay visualizer |
| `funnel` | Conversion funnel |
| `goals` / `g` | Goal progress |
| `challenge` | Weekly challenges |
| `winrate` / `w` | Win rate |
| `tracker` | Trends |
| `performance` | Campaign stats |
| `forecast` | Revenue forecast |
| `velocity` | Deal velocity |
| `trends` | Weekly trends |
| `roi` | ROI calculator |

## Data & Export
| Command | Description |
|---------|-------------|
| `export` / `e` | Export data |
| `backup` | Create backup |
| `archive` | Archive stale leads |
| `cleanup` | Fix data |
| `enrich` | Enrich leads |
| `report` | HTML report |
| `bulk` | Bulk operations |
| `sync` | Smartlead sync |

## Reporting
| Command | Description |
|---------|-------------|
| `overnight` | Overnight work report |
| `briefing` | Morning briefing |
| `weekly` | Weekly report |
| `daily` | Daily summary |

## Notifications
| Command | Description |
|---------|-------------|
| `notify` | Send alerts |
| `alert` | Hot lead alerts |
| `prevent` | Stale prevention |
| `cron` | Cron tasks |

## Infrastructure
| Command | Description |
|---------|-------------|
| `health` / `h` | Pipeline health |
| `server` | Dashboard server |
| `api` | API docs |
| `webhook` | Webhook handler |

## Utilities
| Command | Description |
|---------|-------------|
| `info` | System info |
| `tips` | Random tips |
| `hotkeys` | Shortcuts |
| `workflow` | Guides |
| `mc` | Mission Control |

## New Tools (Feb 7, 2026)
| Command | Description |
|---------|-------------|
| `domain-alerts` | Domain health monitoring with recovery plans |
| `verticals` | Vertical performance analysis |
| `prevent` | Lead decay prevention and at-risk tracking |
| `morning` / `gm` | One-click morning routine |
| `actions` / `todo` | Priority action queue |
| `compare` / `diff` | Status comparison (changes since last check) |
| `eod` | End of day summary |

## New Tools (Feb 8, 2026)
| Command | Description |
|---------|-------------|
| `predict` | Revenue predictor with weighted forecasting |
| `forecast-revenue` | Alias for predict |
| `projection` | Alias for predict |

### Predict Command Options
```bash
gex predict              # This month's forecast
gex predict --quarter    # Quarterly forecast
gex predict --scenario   # All three scenarios (30%, 50%, 70%)
gex predict --gap        # Gap to monthly goal
gex predict --deals      # Show deals in forecast
gex predict --trend      # Forecast trend visualization
gex predict --seasonality # B2B seasonality adjustments
gex predict --compare    # Compare to previous forecast
gex predict --history    # Historical accuracy
gex predict --json       # JSON output for automation
gex predict --all        # Show everything
gex predict --record "Jan 2026" 15000  # Record actual results
```

---
*Run `node gex.js list` for complete list*
*Total: 237 commands | 42 major tools*
