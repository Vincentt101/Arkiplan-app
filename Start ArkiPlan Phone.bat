@echo off
rem Starts the ArkiPlan virtual Android phone and opens the app.
set SDK=%LOCALAPPDATA%\Android\Sdk
start "" "%SDK%\emulator\emulator.exe" -avd ArkiPlan_Phone
"%SDK%\platform-tools\adb.exe" wait-for-device
:boot
for /f %%b in ('"%SDK%\platform-tools\adb.exe" shell getprop sys.boot_completed') do set BOOT=%%b
if not "%BOOT%"=="1" ( timeout /t 3 /nobreak >nul & goto boot )
"%SDK%\platform-tools\adb.exe" shell am start -n com.arkiplan.app/.MainActivity
