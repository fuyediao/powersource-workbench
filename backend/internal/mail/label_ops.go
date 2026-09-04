package mail

func applyArchiveLabels(labels []string) []string {
	labels = toggleLabel(labels, "INBOX", false)
	labels = toggleLabel(labels, "TRASH", false)
	labels = toggleLabel(labels, "SPAM", false)
	labels = toggleLabel(labels, "SNOOZED", false)
	return toggleLabel(labels, "ARCHIVE", true)
}

func applySpamLabels(labels []string) []string {
	labels = toggleLabel(labels, "INBOX", false)
	labels = toggleLabel(labels, "TRASH", false)
	labels = toggleLabel(labels, "ARCHIVE", false)
	labels = toggleLabel(labels, "SNOOZED", false)
	return toggleLabel(labels, "SPAM", true)
}

func applyNotSpamLabels(labels []string) []string {
	labels = toggleLabel(labels, "SPAM", false)
	labels = toggleLabel(labels, "TRASH", false)
	labels = toggleLabel(labels, "ARCHIVE", false)
	return toggleLabel(labels, "INBOX", true)
}

func applySnoozeLabels(labels []string) []string {
	labels = toggleLabel(labels, "INBOX", false)
	labels = toggleLabel(labels, "ARCHIVE", false)
	return toggleLabel(labels, "SNOOZED", true)
}

func applyUnsnoozeLabels(labels []string) []string {
	labels = toggleLabel(labels, "SNOOZED", false)
	labels = toggleLabel(labels, "ARCHIVE", false)
	return toggleLabel(labels, "INBOX", true)
}

func applyUnarchiveLabels(labels []string) []string {
	labels = toggleLabel(labels, "ARCHIVE", false)
	labels = toggleLabel(labels, "TRASH", false)
	labels = toggleLabel(labels, "SPAM", false)
	return toggleLabel(labels, "INBOX", true)
}

func applyUntrashLabels(labels []string) []string {
	labels = toggleLabel(labels, "TRASH", false)
	labels = toggleLabel(labels, "SPAM", false)
	labels = toggleLabel(labels, "ARCHIVE", false)
	return toggleLabel(labels, "INBOX", true)
}
