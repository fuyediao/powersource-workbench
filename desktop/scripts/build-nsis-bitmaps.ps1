# Regenerates NSIS installer bitmaps from public/app-icon.png.
# Requires Windows System.Drawing. Output is 24-bit BMP (NSIS MUI requirement).

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $root 'public\app-icon.png'
$headerPath = Join-Path $root 'build\installerHeader.bmp'
$sidebarPath = Join-Path $root 'build\installerSidebar.bmp'

if (-not (Test-Path $iconPath)) {
  throw "Missing GeoCRM icon: $iconPath"
}

New-Item -ItemType Directory -Force -Path (Join-Path $root 'build') | Out-Null

$mint = [System.Drawing.Color]::FromArgb(69, 200, 141)
$canvas = [System.Drawing.Color]::FromArgb(248, 250, 252)
$ink = [System.Drawing.Color]::FromArgb(15, 23, 42)
$white = [System.Drawing.Color]::White

$icon = [System.Drawing.Image]::FromFile($iconPath)
try {
  $header = New-Object System.Drawing.Bitmap 150, 57, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $hg = [System.Drawing.Graphics]::FromImage($header)
  try {
    $hg.Clear($canvas)
    $hg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $hg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $hg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $hg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $hg.DrawImage($icon, 8, 6, 45, 45)
    $font = New-Object System.Drawing.Font 'Segoe UI Semibold', 13, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    try {
      $brush = New-Object System.Drawing.SolidBrush $ink
      try {
        $hg.DrawString('GeoCRM', $font, $brush, 58, 18)
      }
      finally { $brush.Dispose() }
    }
    finally { $font.Dispose() }
    $accent = New-Object System.Drawing.SolidBrush $mint
    try {
      $hg.FillRectangle($accent, 0, 54, 150, 3)
    }
    finally { $accent.Dispose() }
  }
  finally { $hg.Dispose() }
  $header.Save($headerPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $header.Dispose()

  $sidebar = New-Object System.Drawing.Bitmap 164, 314, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $sg = [System.Drawing.Graphics]::FromImage($sidebar)
  try {
    $sg.Clear($mint)
    $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $sg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $sg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $sg.DrawImage($icon, 20, 56, 124, 124)
    $titleFont = New-Object System.Drawing.Font 'Segoe UI Semibold', 18, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $captionFont = New-Object System.Drawing.Font 'Segoe UI', 11, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    try {
      $whiteBrush = New-Object System.Drawing.SolidBrush $white
      $format = New-Object System.Drawing.StringFormat
      $format.Alignment = [System.Drawing.StringAlignment]::Center
      try {
        $sg.DrawString('GeoCRM', $titleFont, $whiteBrush, (New-Object System.Drawing.RectangleF 0, 198, 164, 28), $format)
        $sg.DrawString('Desktop', $captionFont, $whiteBrush, (New-Object System.Drawing.RectangleF 0, 226, 164, 20), $format)
      }
      finally {
        $whiteBrush.Dispose()
        $format.Dispose()
      }
    }
    finally {
      $titleFont.Dispose()
      $captionFont.Dispose()
    }
  }
  finally { $sg.Dispose() }
  $sidebar.Save($sidebarPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $sidebar.Dispose()
}
finally {
  $icon.Dispose()
}

Write-Host "[nsis] wrote $headerPath"
Write-Host "[nsis] wrote $sidebarPath"
