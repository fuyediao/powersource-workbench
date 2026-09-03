import { afterEach, describe, expect, it } from 'vitest'

import { clashListen } from './bridge'
import { emitRendererEvent, listenRendererEvent } from './renderer-events'

const unlistens: Array<() => void> = []

afterEach(() => {
  for (const unlisten of unlistens.splice(0)) {
    unlisten()
  }
})

describe('renderer events', () => {
  it('delivers payload to listeners and stops after unsubscribe', () => {
    const received: unknown[] = []
    unlistens.push(
      listenRendererEvent('verge://test-all', ({ payload }) => {
        received.push(payload)
      }),
    )

    emitRendererEvent('verge://test-all', null)
    expect(received).toEqual([null])

    unlistens.splice(0).forEach((unlisten) => unlisten())
    emitRendererEvent('verge://test-all', null)
    expect(received).toEqual([null])
  })

  it('reaches clashListen subscribers so Test All can fan out', async () => {
    const received: unknown[] = []
    unlistens.push(
      await clashListen('verge://test-all', ({ payload }) => {
        received.push(payload)
      }),
    )

    emitRendererEvent('verge://test-all', null)
    expect(received).toEqual([null])
  })
})
