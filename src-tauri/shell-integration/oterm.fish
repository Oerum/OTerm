function __oterm_precmd --on-event fish_prompt
    set -l code $status
    printf '\033]133;D;%s\033\\' $code
    printf '\033]133;A\033\\'
end

function __oterm_postprompt --on-event fish_postprompt
    printf '\033]133;B\033\\'
    printf '\033]7;file://%s\033\\' (pwd)
end

function __oterm_preexec --on-event fish_preexec
    printf '\033]133;C\033\\'
end

if functions -q fish_colorize
    function fish_colorize
        set -l cmd (commandline -p | string split -f1 ' ')
        switch $cmd[1]
            case git docker npm pnpm yarn cargo go python python3 node
                set_color green
            case '*'
                set_color normal
        end
    end
end
