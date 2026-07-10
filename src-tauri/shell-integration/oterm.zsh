# OTerm shell integration — Zsh
__oterm_precmd() {
  local code=$?
  print -Pn "\e]133;D;${code}\a"
  print -Pn "\e]133;A\a"
}

__oterm_preexec() {
  print -Pn "\e]133;C\a"
}

__oterm_prompt_end() {
  print -Pn "\e]133;B\a"
  print -Pn "\e]7;file://${PWD}\a"
}

precmd_functions+=(__oterm_precmd)
preexec_functions+=(__oterm_preexec)
precmd_functions+=(__oterm_prompt_end)
