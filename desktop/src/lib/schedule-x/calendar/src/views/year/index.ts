import { createPreactView } from '../../utils/stateful/preact-view/preact-view'
import { InternalViewName } from '@schedule-x/shared/src/enums/calendar/internal-view.enum'
import { YearWrapper } from './components/year-wrapper'
import { setRangeForYear } from '../../utils/stateless/time/range/set-range'
import { addYears } from '@schedule-x/shared/src/utils/stateless/time/date-time-mutation/adding'

const config = {
  name: InternalViewName.Year,
  label: 'Year',
  Component: YearWrapper,
  setDateRange: setRangeForYear,
  hasSmallScreenCompat: true,
  hasWideScreenCompat: true,
  backwardForwardFn: addYears,
  backwardForwardUnits: 1,
}

export const viewYear = createPreactView(config)
export const createViewYear = () => createPreactView(config)
