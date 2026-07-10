# OTerm shell integration — Bash
__oterm_last_code=0

__oterm_precmd() {
  local code=$?
  printf '\033]133;D;%s\033\\' "$code"
  printf '\033]133;A\033\\'
}

__oterm_prompt_cmd() {
  printf '\033]133;B\033\\'
  printf '\033]7;file://%s\033\\' "$PWD"
}

__oterm_preexec() {
  __oterm_last_code=$?
  printf '\033]133;C\033\\'
}

if [[ -n "$PROMPT_COMMAND" ]]; then
  PROMPT_COMMAND="__oterm_precmd; __oterm_prompt_cmd; $PROMPT_COMMAND"
else
  PROMPT_COMMAND="__oterm_precmd; __oterm_prompt_cmd"
fi

if [[ "$-" == *x* ]]; then
  __oterm_debug() {
    if [[ "$BASH_COMMAND" != "$__oterm_last" && "$BASH_COMMAND" != __oterm_* ]]; then
      __oterm_last="$BASH_COMMAND"
      __oterm_preexec
    fi
  }
  trap '__oterm_debug' DEBUG
fi
