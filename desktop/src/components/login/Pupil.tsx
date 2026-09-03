import { useEffect, useRef, useState } from 'react'

interface PupilProps {
  size?: number
  maxDistance?: number
  pupilColor?: string
  forceLookX?: number
  forceLookY?: number
}

/**
 * Animated pupil that follows the mouse or a forced look direction.
 * @param props - Size, color, and optional forced look.
 * @returns Pupil element.
 */
export function Pupil({
  size = 12,
  maxDistance = 5,
  pupilColor = 'black',
  forceLookX,
  forceLookY,
}: PupilProps) {
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
      className="rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: pupilColor,
        transform: `translate(${offsetX}px, ${offsetY}px)`,
        transition: 'transform 0.1s ease-out',
      }}
    />
  )
}
