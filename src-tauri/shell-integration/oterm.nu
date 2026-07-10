let-env __oterm_last_code = 0

def __oterm_precmd [] {
    let code = $env.LAST_EXIT_CODE
    print -r $"(\u001b]133;D;($code)\u0007)"
    print -r $"(\u001b]133;A\u0007)"
}

def __oterm_prompt_end [] {
    print -r $"(\u001b]133;B\u0007)"
    print -r $"(\u001b]7;file://($env.PWD)\u0007)"
}

def __oterm_preexec [cmd: string] {
    print -r $"(\u001b]133;C\u0007)"
}

$env.config = ($env.config | default {})
$env.config = ($env.config | upsert hooks { |h| $h | default {} })
$env.config = ($env.config | upsert hooks.pre_prompt { |list| ($list | default []) ++ [__oterm_precmd __oterm_prompt_end] })
$env.config = ($env.config | upsert hooks.pre_execution { |list| ($list | default []) ++ [__oterm_preexec] })
