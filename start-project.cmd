@echo off
setlocal
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0scripts\start-project.ps1" %*
