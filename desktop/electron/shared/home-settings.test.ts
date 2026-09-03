import { describe, expect, it } from 'vitest'
import { homeWallpaperMediaUrl, homeWallpaperThumbPath } from './home-settings'

describe('home wallpaper paths', () => {
  it('builds a privileged custom-protocol URL', () => {
    expect(homeWallpaperMediaUrl('user-1/photo.jpg')).toBe(
      'workbench-wallpaper://files/user-1/photo.jpg',
    )
  })

  it('derives a companion thumbnail path', () => {
    expect(homeWallpaperThumbPath('user-1/photo.jpg')).toBe('user-1/photo.thumb.webp')
  })
})
