# GEX Changelog

All notable changes to the GEX Lead Generation Command Center.

## [1.3.0] - 2026-02-06

### Added
- **Workflow guides** (`node gex.js workflow`) - Step-by-step instructions
- **Hotkeys reference** (`node gex.js hotkeys`) - All keyboard shortcuts
- **Onboarding** (`node gex.js onboarding`) - Getting started guide
- **MOTD** (`node gex.js motd`) - Motivational messages
- **Mission Control bridge** (`node gex.js mc`) - Quick access from GEX
- **Bulk operations** (`node gex.js bulk`) - Batch lead management
- **Tab completion** (`completions.sh`) - Bash/Zsh support
- **Commands reference** (`commands.md`) - Complete command list
- **Shortcuts reference** (`shortcuts.md`) - Quick reference card

### Improved
- 116 total commands (up from 100+)
- Better error handling in startup.js
- Version bumped to 1.3.0

## [1.2.0] - 2026-02-06

### Added
- **Setup wizard** (`node gex.js setup`) - First-time setup with directory creation and .env template
- **System validation** (`node gex.js validate`) - Comprehensive system check with --fix option
- **Watch mode** (`node gex.js watch`) - Live monitoring dashboard with auto-refresh
- **Recent activity** (`node gex.js recent`) - Quick overview of pipeline activity
- **System info** (`node gex.js info`) - Detailed system information and command counts
- **Utils library** (`lib/utils.js`) - Shared helper functions for all scripts
- **QUICKREF.md** - Cheat sheet for daily workflow

### Improved
- Better command suggestions using Levenshtein distance matching
- DB config warnings before running database commands
- Helpful exit code messages for common errors
- Setup command creates required directories automatically

### Fixed
- Script existence check before execution
- Better error handling for missing .env file

## [1.1.0] - 2026-02-04

### Added
- 100+ CLI commands for lead management
- Mobile-optimized dashboard view
- Enterprise lead detection
- A/B test tracking
- Smartlead webhook integration

### Improved
- Dashboard keyboard shortcuts
- Lead scoring algorithm
- Email template generation

## [1.0.0] - 2026-02-02

### Added
- Initial release
- Core lead pipeline management
- Supabase integration
- Basic dashboard
- Morning briefing automation
