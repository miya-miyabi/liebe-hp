@echo off
echo START > C:\Users\sumitomomasaya\Desktop\My-HP\bat-debug.log
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0server.ps1" >> C:\Users\sumitomomasaya\Desktop\My-HP\bat-debug.log 2>&1
echo EXIT >> C:\Users\sumitomomasaya\Desktop\My-HP\bat-debug.log
