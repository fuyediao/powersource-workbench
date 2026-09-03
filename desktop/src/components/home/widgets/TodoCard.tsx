import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TodoIcon } from '@/icons/AllIcons'
import { useAnimatedHeight } from '@/hooks/use-animated-height'
import { useWidgetTools } from '@/hooks/use-widget-tools'
import {
  TODO_CARD_VISIBLE_LIMIT,
  TodoComposeField,
  TodoListItems,
} from '@/components/home/widgets/todo-shared'

/**
 * Renders a personal todo list widget (up to 10 rows; full list in Settings → Widgets).
 * @returns Todo list widget.
 */
export function TodoCard() {
  const { t } = useTranslation()
  const { todos, addTodo, toggleTodo, removeTodo } = useWidgetTools()
  const visibleTodos = useMemo(
    () => todos.slice(0, TODO_CARD_VISIBLE_LIMIT),
    [todos],
  )
  // Height follows item count only — reordering on complete must not remeasure.
  const { shellRef, contentRef } = useAnimatedHeight([visibleTodos.length])

  return (
    <section
      ref={shellRef}
      className="glass-panel overflow-hidden rounded-3xl will-change-[height]"
    >
      <div ref={contentRef} className="p-5">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-brand">{t('todo.title')}</h2>
            <p className="mt-1 text-xs text-muted">{t('todo.subtitle')}</p>
          </div>
          <span className="grid size-9 place-items-center rounded-xl bg-brand/15 text-brand">
            <TodoIcon className="size-5" />
          </span>
        </header>

        <TodoComposeField
          placeholder={t('todo.placeholder')}
          className={visibleTodos.length > 0 ? 'mb-3' : undefined}
          onSubmitText={addTodo}
        />

        <TodoListItems
          items={visibleTodos}
          onToggle={(id, done) => void toggleTodo(id, done)}
          onRemove={(id) => void removeTodo(id)}
        />
      </div>
    </section>
  )
}
