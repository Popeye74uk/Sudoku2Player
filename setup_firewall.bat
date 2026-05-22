@echo off
title Sudoku Duel - Firewall Setup
echo ========================================================
echo   SUDOKU DUEL - NETWORK FIREWALL PORT OPENER
echo ========================================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :run_setup
) else (
    echo [i] Requesting Administrator privileges to modify firewall...
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    cscript //nologo "%temp%\getadmin.vbs"
    del "%temp%\getadmin.vbs"
    exit /B
)


:run_setup
echo [1/2] Removing any old Sudoku Duel firewall rules...
netsh advfirewall firewall delete rule name="Sudoku Duel Server (Port 8080)" >nul 2>&1

echo [2/2] Creating inbound rule to allow TCP Port 8080...
netsh advfirewall firewall add rule name="Sudoku Duel Server (Port 8080)" dir=in action=allow protocol=TCP localport=8080

echo.
echo ========================================================
echo   SUCCESS! Inbound connections on Port 8080 are now allowed.
echo   You can now scan the QR code on mobile devices!
echo.
echo   Requirements checklist:
echo   1. Mobile and laptop must be on the EXACT same Wi-Fi.
echo   2. Mobile must NOT be on mobile cellular data (LTE/5G).
echo ========================================================
echo.
pause
