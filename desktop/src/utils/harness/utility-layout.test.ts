import { describe, expect, it } from 'vitest'
import {
  HARNESS_LEFT_SIDEBAR_WIDTH,
  HARNESS_MIDDLE_CONTENT_WIDTH,
  HARNESS_MIDDLE_MIN_WIDTH,
  HARNESS_UTILITY_MAX_WIDTH,
  HARNESS_UTILITY_MIN_WIDTH,
  resolveHarnessUtilityWidth,
} from '@/utils/harness/utility-layout'

describe('resolveHarnessUtilityWidth', () => {
  it('fills leftover space beside the middle content column in auto mode', () => {
    const containerWidth = HARNESS_LEFT_SIDEBAR_WIDTH + HARNESS_MIDDLE_CONTENT_WIDTH + 500
    const result = resolveHarnessUtilityWidth({
      containerWidth,
      leftSidebarVisible: true,
      preferredWidth: 360,
      preferManualWidth: false,
    })
    expect(result.width).toBe(500)
    expect(result.maxWidth).toBe(Math.min(
      HARNESS_UTILITY_MAX_WIDTH,
      containerWidth - HARNESS_LEFT_SIDEBAR_WIDTH - HARNESS_MIDDLE_MIN_WIDTH,
    ))
  })

  it('keeps a manual drag within the dynamic max that protects the middle column', () => {
    const containerWidth = HARNESS_LEFT_SIDEBAR_WIDTH + HARNESS_MIDDLE_MIN_WIDTH + 400
    const result = resolveHarnessUtilityWidth({
      containerWidth,
      leftSidebarVisible: true,
      preferredWidth: 700,
      preferManualWidth: true,
    })
    expect(result.width).toBe(400)
    expect(result.maxWidth).toBe(400)
  })

  it('never goes below the utility minimum', () => {
    const result = resolveHarnessUtilityWidth({
      containerWidth: 900,
      leftSidebarVisible: true,
      preferredWidth: 100,
      preferManualWidth: true,
    })
    expect(result.width).toBe(HARNESS_UTILITY_MIN_WIDTH)
  })
})
