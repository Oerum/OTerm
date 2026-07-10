@echo off
setlocal EnableDelayedExpansion
set "OTERM_CMD_HOOK=1"
if not defined PROMPT set "PROMPT=$P$G"
set "PROMPT=$E]133;D;0$E\$E]133;A$E\ %PROMPT%$E]133;B$E\ "
doskey cd=cd $* ^& echo $E]7;file://%CD:\=/%$E\
