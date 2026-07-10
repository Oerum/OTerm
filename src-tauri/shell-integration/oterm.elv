fn __oterm_precmd {=
  var code = ?status
  print "\e]133;D;" + $code + "\a"
  print "\e]133;A\a"
}
fn __oterm_prompt_end {=
  print "\e]133;B\a"
  print "\e]7;file://" + (pwd) + "\a"
}
fn __oterm_preexec {=
  print "\e]133;C\a"
}
edit:prompt:after = { edit:prompt:after; __oterm_precmd; __oterm_prompt_end }
edit:command:before = { edit:command:before; __oterm_preexec }
