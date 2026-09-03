import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { LightweightTrafficErrorBoundary } from '@/components/clash/shared/traffic-error-boundary'
import { useMemoryData } from '@/hooks/clash/use-memory-data'
import { useTrafficData } from '@/hooks/clash/use-traffic-data'
import { useVerge } from '@/hooks/clash/use-verge'
import { useVisibility } from '@/hooks/clash/use-visibility'
import {
  CpuIcon,
  LucideArrowDownIcon,
  LucideArrowUpIcon,
} from '@/icons/AllIcons'
import parseTraffic from '@/utils/clash/parse-traffic'

import { TrafficGraph, type TrafficRef } from './traffic-graph'

interface LayoutTrafficProps {
  /** When false, hide graph and metric labels (collapsed Admin rail). */
  expanded: boolean
}

/**
 * Formats a traffic metric as value + unit.
 * @param bytes - Raw byte count.
 * @returns Display pair.
 */
function formatMetric(bytes: number): { value: string; unit: string } {
  const [value, unit] = parseTraffic(bytes)
  return { value: String(value), unit: String(unit) }
}

/**
 * Clash sidebar traffic / memory footer (Admin rail density).
 * @param props - Expand state.
 * @returns Traffic block.
 */
export const LayoutTraffic = ({ expanded }: LayoutTrafficProps) => {
  const { t } = useTranslation()
  const { verge } = useVerge()

  const trafficGraph = verge?.traffic_graph ?? true
  const displayMemory = verge?.enable_memory_usage ?? true

  const trafficRef = useRef<TrafficRef>(null)
  const pageVisible = useVisibility()

  const {
    response: { data: traffic },
  } = useTrafficData({ enabled: pageVisible })
  const {
    response: { data: memory },
  } = useMemoryData({ enabled: displayMemory && pageVisible })

  useEffect(() => {
    if (trafficRef.current) {
      trafficRef.current.appendData({
        up: traffic?.up || 0,
        down: traffic?.down || 0,
        upTotal: traffic?.upTotal || 0,
        downTotal: traffic?.downTotal || 0,
      })
    }
  }, [traffic])

  const up = formatMetric(traffic?.up || 0)
  const down = formatMetric(traffic?.down || 0)
  const inuse = formatMetric(memory?.inuse || 0)
  const upActive = (traffic?.up || 0) > 0
  const downActive = (traffic?.down || 0) > 0

  if (!expanded) {
    return null
  }

  return (
    <LightweightTrafficErrorBoundary>
      <div className="px-2 pb-1">
        {trafficGraph && pageVisible ? (
          <button
            type="button"
            className="mb-1.5 block h-[60px] w-full cursor-pointer border-0 bg-transparent p-0"
            onClick={() => trafficRef.current?.toggleStyle()}
          >
            <TrafficGraph ref={trafficRef} />
          </button>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <div
            className="flex items-center whitespace-nowrap text-xs"
            title={t('home.components.traffic.metrics.uploadSpeed')}
          >
            <LucideArrowUpIcon
              className={`mr-2 size-4 shrink-0 ${upActive ? 'text-emerald-500' : 'text-muted'}`}
              aria-hidden
            />
            <span
              className={`min-w-0 flex-1 text-center tabular-nums select-none ${
                upActive ? 'text-emerald-500' : 'text-ink'
              }`}
            >
              {up.value}
            </span>
            <span className="w-7 shrink-0 text-right text-[11px] text-muted select-none">
              {up.unit}/s
            </span>
          </div>

          <div
            className="flex items-center whitespace-nowrap text-xs"
            title={t('home.components.traffic.metrics.downloadSpeed')}
          >
            <LucideArrowDownIcon
              className={`mr-2 size-4 shrink-0 ${downActive ? 'text-brand' : 'text-muted'}`}
              aria-hidden
            />
            <span
              className={`min-w-0 flex-1 text-center tabular-nums select-none ${
                downActive ? 'text-brand' : 'text-ink'
              }`}
            >
              {down.value}
            </span>
            <span className="w-7 shrink-0 text-right text-[11px] text-muted select-none">
              {down.unit}/s
            </span>
          </div>

          {displayMemory ? (
            <div
              className="flex items-center whitespace-nowrap text-xs text-muted"
              title={t('home.components.traffic.metrics.memoryUsage')}
            >
              <CpuIcon className="mr-2 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 text-center tabular-nums text-ink select-none">
                {inuse.value}
              </span>
              <span className="w-7 shrink-0 text-right text-[11px] select-none">
                {inuse.unit}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </LightweightTrafficErrorBoundary>
  )
}
