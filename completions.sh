#!/bin/bash
# GEX CLI Command Completions
#
# Add to your .bashrc or .zshrc:
#   source /path/to/completions.sh
#
# Or for bash:
#   eval "$(node gex.js --completions bash)"
#
# Or for zsh:
#   eval "$(node gex.js --completions zsh)"

_gex_completions() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  
  # Main commands
  local commands="
    status pulse today start recent daily planner brief exec weekly digest
    closer rank prep drafts calendar mark schedule templates reactivate
    research competitors
    cleanup enrich export backup report
    notify prevent hotdraft hb forecast next cron
    healthmon health webhook server api sync ab velocity conversion scorecard
    dd fast reengage rtt inbox book winrate nba tgalert enricher seq batch
    campaigns morning score autofollowup dealvelocity outreach revenue notes
    summary qa pipreport dupes diff company enterprise weeklywins fu
    pdrafts enrich2 alert insights followup optimize dreport rhelp action
    mprep trends roi stale compintel overnight email syshealth qwins
    booking viz tg recent validate watch info mc bulk start
    setup doctor version help list
  "
  
  COMPREPLY=($(compgen -W "$commands" -- "$cur"))
}

# Register completion for common invocations
complete -F _gex_completions node
complete -F _gex_completions gex
complete -F _gex_completions gex.js

# For zsh users
if [[ -n "$ZSH_VERSION" ]]; then
  autoload -U +X bashcompinit && bashcompinit
  complete -F _gex_completions node
  complete -F _gex_completions gex
fi

echo "✅ GEX completions loaded. Type 'node gex.js <tab>' for suggestions."
