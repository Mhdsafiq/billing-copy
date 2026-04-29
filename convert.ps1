Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("C:\Users\Mohammed Safiq\.gemini\antigravity\brain\c56ede71-cdc1-463e-aa0f-562a60d42c7c\media__1776453444883.jpg")
$img.Save("d:\billing-system-main\billing-system\assets\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
