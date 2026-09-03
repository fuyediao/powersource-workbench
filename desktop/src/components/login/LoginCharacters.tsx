import { useEffect, useRef, useState } from 'react'
import { EyeBall } from '@/components/login/EyeBall'
import { Pupil } from '@/components/login/Pupil'

interface CharPos {
  faceX: number
  faceY: number
  bodySkew: number
}

interface LoginCharactersProps {
  isTyping: boolean
  password: string
  showPassword: boolean
}

/**
 * Calculates face offset and body skew for a character given its bounding rect.
 * @param rect - Character root rect.
 * @param mouseX - Global mouse X.
 * @param mouseY - Global mouse Y.
 * @returns Face and skew offsets.
 */
function calcPos(rect: DOMRect | null, mouseX: number, mouseY: number): CharPos {
  if (!rect) {
    return { faceX: 0, faceY: 0, bodySkew: 0 }
  }
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 3
  const dx = mouseX - cx
  const dy = mouseY - cy
  return {
    faceX: Math.max(-15, Math.min(15, dx / 20)),
    faceY: Math.max(-10, Math.min(10, dy / 30)),
    bodySkew: Math.max(-6, Math.min(6, -dx / 120)),
  }
}

/**
 * Four login mascots with mouse tracking, blink, and password hide/peek (Vue LoginCharactersPanel).
 * @param props - Typing / password interaction flags from the form.
 * @returns Animated character stage.
 */
export function LoginCharacters({
  isTyping,
  password,
  showPassword,
}: LoginCharactersProps) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false)
  const [isPurplePeeking, setIsPurplePeeking] = useState(false)
  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false)
  const [isBlackBlinking, setIsBlackBlinking] = useState(false)
  const [rects, setRects] = useState({
    purple: null as DOMRect | null,
    black: null as DOMRect | null,
    yellow: null as DOMRect | null,
    orange: null as DOMRect | null,
  })
  const purpleRef = useRef<HTMLDivElement>(null)
  const blackRef = useRef<HTMLDivElement>(null)
  const yellowRef = useRef<HTMLDivElement>(null)
  const orangeRef = useRef<HTMLDivElement>(null)
  const pwVisible = password.length > 0 && showPassword
  const pwHidden = password.length > 0 && !showPassword

  useEffect(() => {
    /**
     * Updates mouse position and character rects.
     * @param event - Mouse move event.
     * @returns Nothing.
     */
    function onMouseMove(event: MouseEvent): void {
      setMouse({ x: event.clientX, y: event.clientY })
      setRects({
        purple: purpleRef.current?.getBoundingClientRect() ?? null,
        black: blackRef.current?.getBoundingClientRect() ?? null,
        yellow: yellowRef.current?.getBoundingClientRect() ?? null,
        orange: orangeRef.current?.getBoundingClientRect() ?? null,
      })
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  useEffect(() => {
    if (!isTyping) {
      return
    }
    setIsLookingAtEachOther(true)
    const timer = window.setTimeout(() => {
      setIsLookingAtEachOther(false)
    }, 800)
    return () => {
      window.clearTimeout(timer)
    }
  }, [isTyping])

  useEffect(() => {
    if (!pwVisible) {
      setIsPurplePeeking(false)
      return
    }
    let cancelled = false
    let peekTimer: number | null = null

    /**
     * Schedules the purple character's sneaky peek loop.
     * @returns Nothing.
     */
    function schedulePeek(): void {
      peekTimer = window.setTimeout(() => {
        if (cancelled) {
          return
        }
        setIsPurplePeeking(true)
        window.setTimeout(() => {
          if (cancelled) {
            return
          }
          setIsPurplePeeking(false)
          schedulePeek()
        }, 800)
      }, Math.random() * 3000 + 2000)
    }

    schedulePeek()
    return () => {
      cancelled = true
      if (peekTimer !== null) {
        window.clearTimeout(peekTimer)
      }
    }
  }, [pwVisible])

  useEffect(() => {
    let cancelled = false
    let purpleTimer: number | null = null
    let blackTimer: number | null = null

    /**
     * Schedules a blink loop for one character.
     * @param setBlink - Blink state setter.
     * @param store - Mutable timer handle.
     * @returns Nothing.
     */
    function scheduleBlink(
      setBlink: (value: boolean) => void,
      store: { current: number | null },
    ): void {
      store.current = window.setTimeout(() => {
        if (cancelled) {
          return
        }
        setBlink(true)
        window.setTimeout(() => {
          if (cancelled) {
            return
          }
          setBlink(false)
          scheduleBlink(setBlink, store)
        }, 150)
      }, Math.random() * 4000 + 3000)
    }

    const purpleStore = { current: null as number | null }
    const blackStore = { current: null as number | null }
    scheduleBlink(setIsPurpleBlinking, purpleStore)
    scheduleBlink(setIsBlackBlinking, blackStore)
    purpleTimer = purpleStore.current
    blackTimer = blackStore.current

    return () => {
      cancelled = true
      if (purpleTimer !== null) {
        window.clearTimeout(purpleTimer)
      }
      if (blackTimer !== null) {
        window.clearTimeout(blackTimer)
      }
      if (purpleStore.current !== null) {
        window.clearTimeout(purpleStore.current)
      }
      if (blackStore.current !== null) {
        window.clearTimeout(blackStore.current)
      }
    }
  }, [])

  const purplePos = calcPos(rects.purple, mouse.x, mouse.y)
  const blackPos = calcPos(rects.black, mouse.x, mouse.y)
  const yellowPos = calcPos(rects.yellow, mouse.x, mouse.y)
  const orangePos = calcPos(rects.orange, mouse.x, mouse.y)

  const purpleHeight = isTyping || pwHidden ? 440 : 400
  const purpleTransform = pwVisible
    ? 'skewX(0deg)'
    : isTyping || pwHidden
      ? `skewX(${purplePos.bodySkew - 12}deg) translateX(40px)`
      : `skewX(${purplePos.bodySkew}deg)`
  const purpleEyeLeft = pwVisible
    ? 20
    : isLookingAtEachOther
      ? 55
      : 45 + purplePos.faceX
  const purpleEyeTop = pwVisible
    ? 35
    : isLookingAtEachOther
      ? 65
      : 40 + purplePos.faceY
  const purpleForceLookX = pwVisible
    ? isPurplePeeking
      ? 4
      : -4
    : isLookingAtEachOther
      ? 3
      : undefined
  const purpleForceLookY = pwVisible
    ? isPurplePeeking
      ? 5
      : -4
    : isLookingAtEachOther
      ? 4
      : undefined

  const blackTransform = pwVisible
    ? 'skewX(0deg)'
    : isLookingAtEachOther
      ? `skewX(${blackPos.bodySkew * 1.5 + 10}deg) translateX(20px)`
      : isTyping || pwHidden
        ? `skewX(${blackPos.bodySkew * 1.5}deg)`
        : `skewX(${blackPos.bodySkew}deg)`
  const blackEyeLeft = pwVisible
    ? 10
    : isLookingAtEachOther
      ? 32
      : 26 + blackPos.faceX
  const blackEyeTop = pwVisible
    ? 28
    : isLookingAtEachOther
      ? 12
      : 32 + blackPos.faceY
  const blackForceLookX = pwVisible ? -4 : isLookingAtEachOther ? 0 : undefined
  const blackForceLookY = pwVisible ? -4 : isLookingAtEachOther ? -4 : undefined

  const orangeTransform = pwVisible ? 'skewX(0deg)' : `skewX(${orangePos.bodySkew}deg)`
  const orangeEyeLeft = pwVisible ? 50 : 82 + orangePos.faceX
  const orangeEyeTop = pwVisible ? 85 : 90 + orangePos.faceY
  const orangeForceLookX = pwVisible ? -5 : undefined
  const orangeForceLookY = pwVisible ? -4 : undefined

  const yellowTransform = pwVisible ? 'skewX(0deg)' : `skewX(${yellowPos.bodySkew}deg)`
  const yellowEyeLeft = pwVisible ? 20 : 52 + yellowPos.faceX
  const yellowEyeTop = pwVisible ? 35 : 40 + yellowPos.faceY
  const yellowMouthLeft = pwVisible ? 10 : 40 + yellowPos.faceX
  const yellowMouthTop = pwVisible ? 88 : 88 + yellowPos.faceY
  const yellowForceLookX = pwVisible ? -5 : undefined
  const yellowForceLookY = pwVisible ? -4 : undefined

  return (
    <div
      className="relative z-20 flex h-[min(500px,55dvh)] items-end justify-center"
      data-login-characters
    >
      <div className="relative h-[400px] w-[min(100%,550px)]">
        <div
          ref={purpleRef}
          className="absolute bottom-0 z-[1] w-[180px] rounded-t-[10px] bg-[#6C3FF5] transition-all duration-700 ease-in-out"
          style={{
            left: 70,
            height: purpleHeight,
            transform: purpleTransform,
            transformOrigin: 'bottom center',
            opacity: pwVisible ? 0.35 : 1,
          }}
          aria-hidden
        >
          <div
            className="absolute flex gap-8 transition-all duration-700 ease-in-out"
            style={{ left: purpleEyeLeft, top: purpleEyeTop }}
          >
            <EyeBall
              size={18}
              pupilSize={7}
              maxDistance={5}
              eyeColor="white"
              pupilColor="#2D2D2D"
              isBlinking={isPurpleBlinking}
              forceLookX={purpleForceLookX}
              forceLookY={purpleForceLookY}
            />
            <EyeBall
              size={18}
              pupilSize={7}
              maxDistance={5}
              eyeColor="white"
              pupilColor="#2D2D2D"
              isBlinking={isPurpleBlinking}
              forceLookX={purpleForceLookX}
              forceLookY={purpleForceLookY}
            />
          </div>
        </div>

        <div
          ref={blackRef}
          className="absolute bottom-0 z-[2] h-[310px] w-[120px] rounded-t-lg bg-[#2D2D2D] transition-all duration-700 ease-in-out"
          style={{
            left: 240,
            transform: blackTransform,
            transformOrigin: 'bottom center',
          }}
          aria-hidden
        >
          <div
            className="absolute flex gap-6 transition-all duration-700 ease-in-out"
            style={{ left: blackEyeLeft, top: blackEyeTop }}
          >
            <EyeBall
              size={16}
              pupilSize={6}
              maxDistance={4}
              eyeColor="white"
              pupilColor="#2D2D2D"
              isBlinking={isBlackBlinking}
              forceLookX={blackForceLookX}
              forceLookY={blackForceLookY}
            />
            <EyeBall
              size={16}
              pupilSize={6}
              maxDistance={4}
              eyeColor="white"
              pupilColor="#2D2D2D"
              isBlinking={isBlackBlinking}
              forceLookX={blackForceLookX}
              forceLookY={blackForceLookY}
            />
          </div>
        </div>

        <div
          ref={orangeRef}
          className="absolute bottom-0 z-[3] h-[200px] w-[240px] bg-[#FF9B6B] transition-all duration-700 ease-in-out"
          style={{
            left: 0,
            borderRadius: '120px 120px 0 0',
            transform: orangeTransform,
            transformOrigin: 'bottom center',
          }}
          aria-hidden
        >
          <div
            className="absolute flex gap-8 transition-all duration-200 ease-out"
            style={{ left: orangeEyeLeft, top: orangeEyeTop }}
          >
            <Pupil
              size={12}
              maxDistance={5}
              pupilColor="#2D2D2D"
              forceLookX={orangeForceLookX}
              forceLookY={orangeForceLookY}
            />
            <Pupil
              size={12}
              maxDistance={5}
              pupilColor="#2D2D2D"
              forceLookX={orangeForceLookX}
              forceLookY={orangeForceLookY}
            />
          </div>
        </div>

        <div
          ref={yellowRef}
          className="absolute bottom-0 z-[4] h-[230px] w-[140px] bg-[#E8D754] transition-all duration-700 ease-in-out"
          style={{
            left: 310,
            borderRadius: '70px 70px 0 0',
            transform: yellowTransform,
            transformOrigin: 'bottom center',
          }}
          aria-hidden
        >
          <div
            className="absolute flex gap-6 transition-all duration-200 ease-out"
            style={{ left: yellowEyeLeft, top: yellowEyeTop }}
          >
            <Pupil
              size={12}
              maxDistance={5}
              pupilColor="#2D2D2D"
              forceLookX={yellowForceLookX}
              forceLookY={yellowForceLookY}
            />
            <Pupil
              size={12}
              maxDistance={5}
              pupilColor="#2D2D2D"
              forceLookX={yellowForceLookX}
              forceLookY={yellowForceLookY}
            />
          </div>
          <div
            className="absolute h-1 w-20 rounded-full bg-[#2D2D2D] transition-all duration-200 ease-out"
            style={{ left: yellowMouthLeft, top: yellowMouthTop }}
          />
        </div>
      </div>
    </div>
  )
}
