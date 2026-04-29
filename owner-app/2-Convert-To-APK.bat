@echo off
echo ========================================================
echo CONVERTING TO ANDROID .APK FILE
echo ========================================================
echo.
echo We are now securely building the .apk file in the cloud.
echo.
echo Important: If it asks you to log in, please sign in with any free Expo account.
echo Press 'Y' if it asks "Would you like to automatically create an EAS project?"
echo Press 'Y' if it asks about "Android Keystore"
echo.
call npm install -g eas-cli
call eas build -p android --profile preview
echo.
echo DONE! Look above for your .apk download link.
pause
