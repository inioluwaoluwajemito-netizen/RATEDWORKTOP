@echo off
echo Building RatedWorktops Mobile App Web Assets...

REM Create or clean the www directory
if exist "www" rmdir /s /q "www"
mkdir www
mkdir www\css
mkdir www\js
mkdir www\images

REM Copy HTML files
copy *.html www\

REM Copy CSS folders
xcopy /s /e /y css\* www\css\

REM Copy JS folders
xcopy /s /e /y js\* www\js\

REM Copy images
xcopy /s /e /y images\* www\images\

echo Build complete! Ready for npx cap sync.
