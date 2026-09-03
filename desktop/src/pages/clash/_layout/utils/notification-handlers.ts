import { showNotice } from '@/services/clash/notice-service'

type NavigateFunction = (path: string, options?: any) => void
type TranslateFunction = (key: string) => string

/**
 * Routes a Clash host notice status to a toast or navigation.
 * @param status - Event name from the host.
 * @param msg - Optional detail.
 * @param t - Translator (unused for some handlers).
 * @param navigate - Clash router navigate.
 */
export const handleNoticeMessage = (
  status: string,
  msg: string,
  t: TranslateFunction,
  navigate: NavigateFunction,
) => {
  const handlers: Record<string, () => void> = {
    'import_sub_url::ok': () => {
      navigate('/profile')
      showNotice.success(
        'shared.feedback.notifications.importSubscriptionSuccess',
      )
    },
    'import_sub_url::error': () => {
      navigate('/profile')
      showNotice.error(msg)
    },
    'set_config::error': () => showNotice.error(msg),
    'tun_mode::auto_disabled': () =>
      showNotice.info(
        'settings.sections.system.notifications.tunMode.autoDisabled',
      ),
    'tun_mode::auto_disable_failed': () =>
      showNotice.error(
        'settings.sections.system.notifications.tunMode.autoDisableFailed',
      ),
    'app_restart::core_stop_failed': () =>
      showNotice.error('layout.feedback.errors.restartCoreStopFailed'),
    'app_quit::core_stop_failed': () =>
      showNotice.error('layout.feedback.errors.quitCoreStopFailed'),
    'reactivate_profiles::error': () => showNotice.error(msg),
    'config_validate::boot_error': () =>
      showNotice.error('shared.feedback.validation.config.bootFailed', msg),
    'config_validate::core_change': () =>
      showNotice.error(
        'shared.feedback.validation.config.coreChangeFailed',
        msg,
      ),
    'config_validate::error': () =>
      showNotice.error('shared.feedback.validation.config.failed', msg),
    'config_validate::process_terminated': () =>
      showNotice.error('shared.feedback.validation.config.processTerminated'),
    'config_validate::stdout_error': () =>
      showNotice.error('shared.feedback.validation.config.failed', msg),
    'config_validate::script_error': () =>
      showNotice.error('shared.feedback.validation.script.fileError', msg),
    'config_validate::script_syntax_error': () =>
      showNotice.error('shared.feedback.validation.script.syntaxError', msg),
    'config_validate::script_missing_main': () =>
      showNotice.error('shared.feedback.validation.script.missingMain', msg),
    'config_validate::file_not_found': () =>
      showNotice.error('shared.feedback.validation.script.fileNotFound', msg),
    'config_validate::yaml_syntax_error': () =>
      showNotice.error('shared.feedback.validation.yaml.syntaxError', msg),
    'config_validate::yaml_read_error': () =>
      showNotice.error('shared.feedback.validation.yaml.readError', msg),
    'config_validate::yaml_mapping_error': () =>
      showNotice.error('shared.feedback.validation.yaml.mappingError', msg),
    'config_validate::yaml_key_error': () =>
      showNotice.error('shared.feedback.validation.yaml.keyError', msg),
    'config_validate::yaml_error': () =>
      showNotice.error('shared.feedback.validation.yaml.generalError', msg),
    'config_validate::merge_syntax_error': () =>
      showNotice.error('shared.feedback.validation.merge.syntaxError', msg),
    'config_validate::merge_mapping_error': () =>
      showNotice.error('shared.feedback.validation.merge.mappingError', msg),
    'config_validate::merge_key_error': () =>
      showNotice.error('shared.feedback.validation.merge.keyError', msg),
    'config_validate::merge_error': () =>
      showNotice.error('shared.feedback.validation.merge.generalError', msg),
    'config_core::change_success': () =>
      showNotice.success(
        'settings.feedback.notifications.clash.changeSuccess',
        msg,
      ),
    'config_core::change_error': () =>
      showNotice.error(
        'settings.feedback.notifications.clash.changeFailed',
        msg,
      ),
    'mixed_port::fallback': () => {
      const [oldPort, newPort] = msg.split(',')
      showNotice.info('settings.modals.clashPort.messages.automaticFallback', {
        oldPort,
        newPort,
      })
    },
    'mixed_port::fallback_error': () =>
      showNotice.error(
        'settings.modals.clashPort.messages.automaticFallbackFailed',
        { error: msg },
      ),
  }

  const handler = handlers[status]
  if (handler) {
    handler()
  } else {
    console.warn(`[clash] unhandled notice status: ${status}`)
  }
}
