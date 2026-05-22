@echo off
setlocal enabledelayedexpansion
title Sudoku Duel - Cross-Device Diagnostics Tool
cls
echo ========================================================
echo   SUDOKU DUEL - CROSS-DEVICE NETWORK DIAGNOSTICS
echo ========================================================
echo.
echo This tool helps you test and diagnose connection issues between
echo your host computer and other devices (iPhone, tablet, laptop).
echo.

:: Detect main IPv4 address using PowerShell
echo Detecting host IP address...
for /f "usebackq delims=" %%i in (`powershell -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notlike '*vEthernet*' -and $_.InterfaceAlias -notlike '*Loopback*' } | Select-Object -First 1).IPAddress"`) do (
    set HOST_IP=%%i
)
if "!HOST_IP!" == "" (
    set HOST_IP=192.168.1.71
)
echo Host IP address detected: !HOST_IP!
echo.

echo [1/5] Checking if Sudoku server is listening on port 8080...
netstat -ano | findstr :8080 >nul 2>&1
if !errorLevel! == 0 (
    echo   [OK] Sync Server is actively running and listening on port 8080!
) else (
    echo   [ERROR] Sync Server is NOT running on port 8080.
    echo           Please make sure you start the server first using "start.bat"!
)
echo.

echo [2/5] Checking Windows Network Profile (Public vs Private)...
powershell -Command "Get-NetConnectionProfile | Select-Object InterfaceAlias, NetworkCategory"
echo.
echo   NOTE: If Category is 'Public', Windows Defender Firewall will block all
echo         incoming connections. Set your Wi-Fi properties to 'Private' in
echo         Windows settings, or turn on Windows Mobile Hotspot.
echo.

echo [3/5] Checking Inbound Firewall Port rule...
netsh advfirewall firewall show rule name="Sudoku Duel Server (Port 8080)" >nul 2>&1
if !errorLevel! == 0 (
    echo   [OK] Inbound firewall rule for Port 8080 is configured!
) else (
    echo   [WARNING] Inbound firewall rule for Port 8080 is MISSING.
    echo             Please double-click "setup_firewall.bat" as Administrator to fix this.
)
echo.

echo [4/5] Checking for conflicting Node.js block rules...
echo (If any rules appear below, Windows is explicitly blocking Node.js)
powershell -Command "Get-NetFirewallRule | Where-Object { ($_.DisplayName -like '*node*' -or $_.Program -like '*node.exe*') -and $_.Action -eq 'Block' -and $_.Enabled -eq 'True' } | Select-Object DisplayName, Action, Enabled"
echo.

echo [5/5] Testing local web server response (Loopback ping)...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://localhost:8080/api/ping' -TimeoutSec 2; if ($r.success) { Write-Output '  [OK] Local Loopback Ping responds successfully!' } else { Write-Output '  [ERROR] Server responded, but returned failure.' } } catch { Write-Output '  [ERROR] Loopback Ping failed: ' + $_.Exception.Message }"
echo.

echo ========================================================
echo   DIAGNOSTIC SUMMARY & ACTION STEPS
echo ========================================================
echo.
echo 1. TEST VIA YOUR PHONE'S BROWSER:
echo    Open Safari/Chrome on your phone and go to this exact URL:
echo       http://!HOST_IP!:8080/api/ping
echo.
echo    - If it says '{"success":true,...}', the connection works! Scan the QR.
echo    - If it spins forever or says 'unreachable', proceeding below.
echo.
echo 2. ENABLE WINDOWS MOBILE HOTSPOT (100%% SUCCESS BYPASS):
echo    Many home/office routers have AP Isolation enabled, preventing Wi-Fi
echo    devices from talking to each other. You can bypass this completely:
echo.
echo    a. In Windows, search and open 'Mobile Hotspot settings' and turn it ON.
echo    b. Connect your phone/tablet to this new Hotspot Wi-Fi network.
echo    c. Refresh the game page on your PC, scan the new QR code, and play!
echo.
echo 3. CONFLICTING FIREWALL RULES:
echo    Search Windows for 'Allow an app through Windows Firewall', click
echo    'Change settings', scroll down to 'Node.js JavaScript Runtime',
echo    and tick both 'Private' and 'Public' checkboxes.
echo.
echo ========================================================
pause
