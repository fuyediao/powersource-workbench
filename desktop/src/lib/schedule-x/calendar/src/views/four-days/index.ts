import { createPreactView } from '../../utils/stateful/preact-view/preact-view'
import { InternalViewName } from '@schedule-x/shared/src/enums/calendar/internal-view.enum'
import { WeekWrapper } from '../week/components/week-wrapper'
import { setRangeForFourDays } from '../../utils/stateless/time/range/set-range'
import { addDays } from '@schedule-x/shared/src/utils/stateless/time/date-time-mutation/adding'

const config = {
  name: InternalViewName.FourDays,
  label: '4 days',
  Component: WeekWrapper,
  setDateRange: setRangeForFourDays,
  hasSmallScreenCompat: false,
  hasWideScreenCompat: true,
  backwardForwardFn: addDays,
  backwardForwardUnits: 4,
}

export const viewFourDays = createPreactView(config)
export const createViewFourDays = () => createPreactView(config)
