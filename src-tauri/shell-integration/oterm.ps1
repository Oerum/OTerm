# OTerm shell integration — PowerShell

function global:__oterm_emit([string]$seq) {
    [Console]::Write([char]27 + "]133;" + $seq + [char]7)
}

function global:__oterm_emit_cwd {
    $path = (Get-Location).Path -replace '\\', '/'
    [Console]::Write([char]27 + "]7;file:///$path" + [char]7)
}

function global:__oterm_exit_code {
    if (-not $?) {
        if ($null -ne $global:LASTEXITCODE -and $global:LASTEXITCODE -ne 0) {
            return $global:LASTEXITCODE
        }
        return 1
    }
    if ($null -ne $global:LASTEXITCODE) {
        return $global:LASTEXITCODE
    }
    return 0
}

if (-not (Test-Path variable:global:__oterm_orig_prompt)) {
    $global:__oterm_orig_prompt = $function:Prompt
}

function global:Prompt {
    $code = __oterm_exit_code
    __oterm_emit "D;$code"
    __oterm_emit "A"
    $result = if ($null -ne $global:__oterm_orig_prompt) { & $global:__oterm_orig_prompt } else { "PS> " }
    __oterm_emit "B"
    __oterm_emit_cwd
    return $result
}

if (Get-Module -ListAvailable -Name PSReadLine) {
    Import-Module PSReadLine -ErrorAction SilentlyContinue
    if (Get-Command Set-PSReadLineOption -ErrorAction SilentlyContinue) {
        Set-PSReadLineOption -CommandValidationHandler {
            param([string]$Command)
            __oterm_emit "C"
            return $true
        }
    }
}

if (Get-Module PSReadLine) {
    Set-PSReadLineOption -Colors @{
        Command            = 'Green'
        Parameter          = 'Cyan'
        Operator           = 'DarkGray'
        Variable           = 'Magenta'
        String             = 'Yellow'
        Number             = 'White'
        Member             = 'Gray'
        Type               = 'Blue'
        ContinuationPrompt = 'DarkGray'
        Default            = 'White'
    }
}
