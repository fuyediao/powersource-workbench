import { useEffect, useState } from 'react'
import {
  WidgetToolsPanel,
  type WidgetToolsSection,
} from '@/components/home/widgets/WidgetToolsPanel'
import {
  DEFAULT_ASIDE_WIDGET_ORDER_LEFT,
  DEFAULT_ASIDE_WIDGET_ORDER_RIGHT,
} from '@/constants/aside-widgets'
import { useSharedPageWidgets } from '@/hooks/page-widgets-context'
import { useWidgetTools } from '@/hooks/use-widget-tools'
import {
  consumePendingWidgetToolsSection,
  subscribeWidgetToolsSectionRequest,
} from '@/utils/settings/settings-section-request'

/**
 * Settings → Widgets: stacked order + per-widget tools (no inner sidebar).
 * @returns Widgets settings section.
 */
export function WidgetsSection() {
  const pageWidgets = useSharedPageWidgets()
  const tools = useWidgetTools()
  const [scrollToSection, setScrollToSection] = useState<WidgetToolsSection | null>(
    () => consumePendingWidgetToolsSection(),
  )

  useEffect(() => {
    return subscribeWidgetToolsSectionRequest((next) => {
      setScrollToSection(next)
    })
  }, [])

  return (
    <WidgetToolsPanel
      scrollToSection={scrollToSection}
      asideRails={pageWidgets.asideRails}
      onSetAsideRails={pageWidgets.setAsideRails}
      onRestoreAsideOrder={() =>
        pageWidgets.setAsideRails({
          left: DEFAULT_ASIDE_WIDGET_ORDER_LEFT,
          right: DEFAULT_ASIDE_WIDGET_ORDER_RIGHT,
        })
      }
      weatherUnit={tools.weatherUnit}
      onSetWeatherUnit={tools.setWeatherUnit}
      weatherPlace={tools.weatherPlace}
      weatherHasLocation={tools.weatherHasLocation}
      weatherRequesting={tools.weatherRequesting}
      weatherPermission={tools.weatherPermission}
      onRequestWeatherLocation={tools.requestWeatherLocation}
      onSelectWeatherPlace={tools.selectWeatherPlace}
      onClearWeatherLocation={tools.clearWeatherLocation}
      from={tools.from}
      to={tools.to}
      onSetFrom={tools.setFrom}
      onSetTo={tools.setTo}
      onSwapCurrencies={tools.swapCurrencies}
      onRestoreCurrencyPair={tools.resetCurrencyPair}
      assets={tools.assets}
      onSetAssets={tools.setAssets}
      onRestoreMarkets={() => tools.setAssets([])}
      todos={tools.todos}
      onAddTodo={tools.addTodo}
      onToggleTodo={tools.toggleTodo}
      onRemoveTodo={tools.removeTodo}
    />
  )
}
