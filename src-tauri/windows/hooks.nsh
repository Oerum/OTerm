Var DevenvPath
Var OTermCmd
Var OTermBgCmd
Var OTermIcon
Var VSIcon
Var VSCmd
Var VSBgCmd

!macro refresh_shell_associations
  System::Call 'shell32::SHChangeNotify(i, i, i, i) i 0x08000000, 0, 0, 0'
!macroend

!macro RegisterFolderShellVerb VERB LABEL ICON COMMAND
  WriteRegStr SHCTX "Software\Classes\Directory\shell\${VERB}" "" "${LABEL}"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\${VERB}" "Icon" "${ICON}"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\${VERB}\command" "" "${COMMAND}"
!macroend

!macro RegisterFolderBackgroundShellVerb VERB LABEL ICON COMMAND
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\${VERB}" "" "${LABEL}"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\${VERB}" "Icon" "${ICON}"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\${VERB}\command" "" "${COMMAND}"
!macroend

!macro RegisterOpenWithApp EXENAME FRIENDLY COMMAND LIST_SLOT
  WriteRegStr SHCTX "Software\Classes\Applications\${EXENAME}" "FriendlyAppName" "${FRIENDLY}"
  WriteRegStr SHCTX "Software\Classes\Applications\${EXENAME}\shell\open\command" "" "${COMMAND}"
  WriteRegStr SHCTX "Software\Classes\Directory\OpenWithList\${LIST_SLOT}" "" "${EXENAME}"
!macroend

Function TrimTrailingWhitespace
  Exch $0
  trim_ws_loop:
    StrLen $1 $0
    IntCmp $1 0 trim_ws_done trim_ws_done 0
    StrCpy $2 $0 1 -1
    StrCmp $2 "$\r" trim_ws_strip
    StrCmp $2 "$\n" trim_ws_strip
    StrCmp $2 " " trim_ws_strip
    Goto trim_ws_done
  trim_ws_strip:
    IntOp $1 $1 - 1
    StrCpy $0 $0 $1
    Goto trim_ws_loop
  trim_ws_done:
  Exch $0
FunctionEnd

!macro TryDevenvCandidate CANDIDATE
  IfFileExists "${CANDIDATE}" 0 +3
    StrCpy $DevenvPath "${CANDIDATE}"
    Return
!macroend

Function FindDevenvPath
  StrCpy $DevenvPath ""
  ReadEnvStr $R0 "ProgramFiles"

  !insertmacro TryDevenvCandidate "$R0\Microsoft Visual Studio\18\Community\Common7\IDE\devenv.exe"
  !insertmacro TryDevenvCandidate "$R0\Microsoft Visual Studio\18\Professional\Common7\IDE\devenv.exe"
  !insertmacro TryDevenvCandidate "$R0\Microsoft Visual Studio\18\Enterprise\Common7\IDE\devenv.exe"
  !insertmacro TryDevenvCandidate "$R0\Microsoft Visual Studio\2022\Community\Common7\IDE\devenv.exe"
  !insertmacro TryDevenvCandidate "$R0\Microsoft Visual Studio\2022\Professional\Common7\IDE\devenv.exe"
  !insertmacro TryDevenvCandidate "$R0\Microsoft Visual Studio\2022\Enterprise\Common7\IDE\devenv.exe"
  !insertmacro TryDevenvCandidate "$R0\Microsoft Visual Studio\2019\Community\Common7\IDE\devenv.exe"
  !insertmacro TryDevenvCandidate "$R0\Microsoft Visual Studio\2019\Professional\Common7\IDE\devenv.exe"
  !insertmacro TryDevenvCandidate "$R0\Microsoft Visual Studio\2019\Enterprise\Common7\IDE\devenv.exe"

  ReadEnvStr $R0 "ProgramFiles(x86)"
  StrCpy $R1 "$R0\Microsoft Visual Studio\Installer\vswhere.exe"
  IfFileExists "$R1" 0 find_devenv_done
  nsExec::ExecToStack '"$R1" -latest -property installationPath'
  Pop $R2
  Pop $R3
  Push $R3
  Call TrimTrailingWhitespace
  Pop $R3
  StrCpy $DevenvPath "$R3\Common7\IDE\devenv.exe"
  IfFileExists "$DevenvPath" find_devenv_done 0
  StrCpy $DevenvPath ""

  find_devenv_done:
FunctionEnd

Function RegisterOTermExplorerMenus
  StrCpy $OTermCmd '"$INSTDIR\oterm.exe" --cwd "%1"'
  StrCpy $OTermBgCmd '"$INSTDIR\oterm.exe" --cwd "%V"'
  StrCpy $OTermIcon "$INSTDIR\oterm.exe,0"

  !insertmacro RegisterFolderShellVerb "OTerm" "Open with OTerm here" "$OTermIcon" "$OTermCmd"
  !insertmacro RegisterFolderBackgroundShellVerb "OTerm" "Open with OTerm here" "$OTermIcon" "$OTermBgCmd"
  !insertmacro RegisterOpenWithApp "oterm.exe" "OTerm" "$OTermCmd" "z"
FunctionEnd

Function RegisterVisualStudioExplorerMenus
  Call FindDevenvPath
  StrCmp $DevenvPath "" register_vs_done

  StrCpy $VSIcon "$DevenvPath,0"
  StrCpy $VSCmd '"$DevenvPath" "%1"'
  StrCpy $VSBgCmd '"$DevenvPath" "%V"'

  !insertmacro RegisterFolderShellVerb "VisualStudio" "Open with Visual Studio" "$VSIcon" "$VSCmd"
  !insertmacro RegisterFolderBackgroundShellVerb "VisualStudio" "Open with Visual Studio" "$VSIcon" "$VSBgCmd"

  ReadRegStr $R4 SHCTX "Software\Classes\Applications\devenv.exe\shell\open\command" ""
  StrCmp $R4 "" register_vs_full register_vs_openwith_only
  register_vs_full:
    !insertmacro RegisterOpenWithApp "devenv.exe" "Microsoft Visual Studio" "$VSCmd" "y"
    Goto register_vs_done
  register_vs_openwith_only:
    WriteRegStr SHCTX "Software\Classes\Directory\OpenWithList\y" "" "devenv.exe"
  register_vs_done:
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  Call RegisterOTermExplorerMenus
  Call RegisterVisualStudioExplorerMenus
  !insertmacro refresh_shell_associations
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\Directory\shell\OTerm"
  DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\OTerm"
  DeleteRegKey SHCTX "Software\Classes\Applications\oterm.exe"
  DeleteRegKey SHCTX "Software\Classes\Directory\OpenWithList\z"

  DeleteRegKey SHCTX "Software\Classes\Directory\shell\VisualStudio"
  DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\VisualStudio"
  DeleteRegKey SHCTX "Software\Classes\Directory\OpenWithList\y"

  !insertmacro refresh_shell_associations
!macroend
