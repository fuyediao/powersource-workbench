import { useEffect, useState } from 'react'

const WEATHER_UNIT_KEY = 'atlas-weather-unit'

export type WeatherUnit = 'celsius' | 'fahrenheit'

/**
 * Reads the persisted temperature unit from localStorage.
 * @returns Celsius or Fahrenheit preference.
 */
function readWeatherUnit(): WeatherUnit {
  try {
    const saved = localStorage.getItem(WEATHER_UNIT_KEY)
    return saved === 'fahrenheit' ? 'fahrenheit' : 'celsius'
  } catch {
    return 'celsius'
  }
}

/**
 * Shared weather temperature unit preference (localStorage-backed).
 * @returns Unit state and helpers.
 */
export function useWeatherUnit(): {
  unit: WeatherUnit
  fahrenheit: boolean
  setUnit: (unit: WeatherUnit) => void
  toggleUnit: () => void
} {
  const [unit, setUnitState] = useState<WeatherUnit>(() => readWeatherUnit())

  useEffect(() => {
    try {
      localStorage.setItem(WEATHER_UNIT_KEY, unit)
    } catch {
      // Ignore quota / private-mode failures.
    }
  }, [unit])

  /**
   * Sets the temperature unit.
   * @param next - Celsius or Fahrenheit.
   * @returns Nothing.
   */
  function setUnit(next: WeatherUnit): void {
    setUnitState(next)
  }

  /**
   * Toggles between Celsius and Fahrenheit.
   * @returns Nothing.
   */
  function toggleUnit(): void {
    setUnitState((current) => (current === 'celsius' ? 'fahrenheit' : 'celsius'))
  }

  return {
    unit,
    fahrenheit: unit === 'fahrenheit',
    setUnit,
    toggleUnit,
  }
}
