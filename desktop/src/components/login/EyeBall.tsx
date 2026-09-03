import { useEffect, useRef, useState } from 'react'

interface EyeBallProps {
  size?: number
  pupilSize?: number
  maxDistance?: number
  eyeColor?: string
  pupilColor?: string
  isBlinking?: boolean
  forceLookX?: number
  forceLookY?: number
}

/**
 * Eyeball with a tracking pupil and optional blink animation.
 * @param props - Size, colors, blink, and optional forced look.
 * @returns Eye element.
 */
export function EyeBall({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = 'white',
  pupilColor = 'black',
  isBlinking = false,
  forceLookX,
  forceLookY,
}: EyeBallProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })

  useEffect(() => {
    /**
     * Tracks global pointer for pupil offset.
     * @param event - Mouse move event.
     * @returns Nothing.
     */
    function onMouseMove(event: MouseEvent): void {
      setMouse({ x: event.clientX, y: event.clientY })
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  let offsetX = 0
  let offsetY = 0
  if (forceLookX !== undefined && forceLookY !== undefined) {
    offsetX = forceLookX
    offsetY = forceLookY
  } else {
    const el = rootRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = mouse.x - cx
      const dy = mouse.y - cy
      const dist = Math.min(Math.hypot(dx, dy), maxDistance)
      const angle = Math.atan2(dy, dx)
      offsetX = Math.cos(angle) * dist
      offsetY = Math.sin(angle) * dist
    }
  }

  return (
    <div
      ref={rootRef}
      className="flex items-center justify-center overflow-hidden rounded-full transition-all duration-150"
      style={{
        width: size,
        height: isBlinking ? 2 : size,
        backgroundColor: eyeColor,
      }}
    >
      {isBlinking ? null : (
        <div
          className="rounded-full"
          style={{
            width: pupilSize,
            height: pupilSize,
            backgroundColor: pupilColor,
            transform: `translate(${offsetX}px, ${offsetY}px)`,
            transition: 'transform 0.1s ease-out',
          }}
        />
      )}
    </div>
  )
}
