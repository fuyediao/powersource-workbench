; PowerSource Workbench NSIS extras. electron-builder includes this before MUI pages.
; Welcome/finish use installerSidebar.bmp; instfiles uses installerHeader.bmp.
; The language dialog (English / Trad. Chinese / Simp. Chinese) is enabled via
; displayLanguageSelector. The choice is stored as a Settings locale.

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Writes install-language.txt (en / zh-TW / zh-CN) for the first app launch.
; Interactive installs write %APPDATA%\${PRODUCT_NAME}\ and $INSTDIR.
; Silent /S updates restore the AppData copy after the extract wipe.
!macro customInstall
  Push $R7
  Push $R8
  Push $R9
  StrCpy $R8 "$APPDATA\${PRODUCT_NAME}\install-language.txt"
  IfSilent workbench_restore_install_language

  StrCpy $R9 "en"
  ${If} $LANGUAGE == 1028
    StrCpy $R9 "zh-TW"
  ${ElseIf} $LANGUAGE == 2052
    StrCpy $R9 "zh-CN"
  ${EndIf}

  CreateDirectory "$APPDATA\${PRODUCT_NAME}"
  FileOpen $R7 "$R8" w
  FileWrite $R7 "$R9"
  FileClose $R7
  CopyFiles /SILENT "$R8" "$INSTDIR\install-language.txt"
  Goto workbench_install_language_done

  workbench_restore_install_language:
    IfFileExists "$R8" 0 workbench_install_language_done
    CopyFiles /SILENT "$R8" "$INSTDIR\install-language.txt"

  workbench_install_language_done:
  Pop $R9
  Pop $R8
  Pop $R7
!macroend
