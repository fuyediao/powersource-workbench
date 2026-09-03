/**
 * Reports whether a message should be treated as spam for toolbar actions.
 * @param labels - Message labels from `/mail/messages`.
 * @param isSpamNav - True when the sidebar is on the spam folder.
 * @returns True when Report not spam should be offered.
 */
export function isMailSpam(labels: string[], isSpamNav: boolean): boolean {
  if (isSpamNav) {
    return true
  }
  return labels.some((label) => label.toUpperCase() === 'SPAM')
}
