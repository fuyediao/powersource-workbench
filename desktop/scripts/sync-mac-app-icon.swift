#!/usr/bin/env swift
/**
 * Rasterizes the macos-M Foreground SVG onto a light squircle plate.
 * `dock.setIcon` draws the bitmap as-is (no system squircle clip), so the
 * plate must already be rounded with a transparent exterior.
 */
import AppKit
import Foundation

let size = 1024
let defaultFill = NSColor(srgbRed: 0.96078, green: 0.96078, blue: 0.96078, alpha: 1)
/// Continuous-ish corner radius (~iOS / macOS icon squircle).
let cornerRadius = CGFloat(size) * 0.2237

guard CommandLine.arguments.count == 3 else {
  fputs("usage: sync-mac-app-icon.swift <foreground.svg> <public-dir>\n", stderr)
  exit(2)
}

let foregroundURL = URL(fileURLWithPath: CommandLine.arguments[1])
let publicDir = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)

/**
 * Loads an SVG as a 1024pt image.
 * @param url - SVG file URL.
 * @returns Rasterizable image.
 */
func loadSvg(_ url: URL) -> NSImage {
  guard let image = NSImage(contentsOf: url) else {
    fputs("failed to load \(url.path)\n", stderr)
    exit(1)
  }
  image.size = NSSize(width: size, height: size)
  return image
}

/**
 * Draws the mark on a light squircle; pixels outside the plate stay transparent.
 * @param mark - Foreground artwork.
 * @returns Bitmap representation.
 */
func renderLightSquircle(mark: NSImage) -> NSBitmapImageRep {
  guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: size,
    pixelsHigh: size,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    fputs("failed to allocate bitmap\n", stderr)
    exit(1)
  }
  rep.size = NSSize(width: size, height: size)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.imageInterpolation = .high
  let bounds = NSRect(x: 0, y: 0, width: size, height: size)
  NSColor.clear.setFill()
  bounds.fill()
  let plate = NSBezierPath(roundedRect: bounds, xRadius: cornerRadius, yRadius: cornerRadius)
  defaultFill.setFill()
  plate.fill()
  plate.addClip()
  mark.draw(
    in: bounds,
    from: .zero,
    operation: .sourceOver,
    fraction: 1,
    respectFlipped: true,
    hints: [.interpolation: NSImageInterpolation.high]
  )
  NSGraphicsContext.restoreGraphicsState()
  return rep
}

guard let data = renderLightSquircle(mark: loadSvg(foregroundURL)).representation(
  using: .png,
  properties: [:]
) else {
  fputs("failed to encode app-icon.png\n", stderr)
  exit(1)
}

let dest = publicDir.appendingPathComponent("app-icon.png")
do {
  try data.write(to: dest)
} catch {
  fputs("failed to write \(dest.path): \(error)\n", stderr)
  exit(1)
}
fputs("wrote \(dest.path)\n", stderr)
