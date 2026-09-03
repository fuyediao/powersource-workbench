import { useEffect, useState } from 'react'
import {
  createTodo,
  deleteTodo,
  fetchTodos,
  setTodoDone,
  sortTodos,
  type TodoItemDto,
} from '@/utils/home/library-api'

/**
 * Loads and mutates the signed-in user's todo list.
 * @param userId - Signed-in user id, or null while unauthenticated.
 * @returns Todos, loading flag, and mutation helpers.
 */
export function useTodos(userId: string | null): {
  items: TodoItemDto[]
  loading: boolean
  addTodo: (text: string) => Promise<void>
  toggleTodo: (id: string, done: boolean) => Promise<void>
  removeTodo: (id: string) => Promise<void>
} {
  const [items, setItems] = useState<TodoItemDto[]>([])
  const [loading, setLoading] = useState(Boolean(userId))

  useEffect(() => {
    if (!userId) {
      setItems([])
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    void fetchTodos(userId)
      .then((next) => {
        if (active) {
          setItems(next)
        }
      })
      .catch(() => {
        if (active) {
          setItems([])
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [userId])

  /**
   * Adds a todo at the top of the incomplete group.
   * @param text - Todo text.
   * @returns Nothing.
   */
  async function addTodo(text: string): Promise<void> {
    if (!userId) {
      return
    }
    const created = await createTodo(userId, text)
    setItems((current) => sortTodos([created, ...current]))
  }

  /**
   * Toggles a todo's completed state and re-sorts incomplete above completed.
   * @param id - Todo id.
   * @param done - Next completed flag.
   * @returns Nothing.
   */
  async function toggleTodo(id: string, done: boolean): Promise<void> {
    if (!userId) {
      return
    }
    setItems((current) =>
      sortTodos(current.map((item) => (item.id === id ? { ...item, done } : item))),
    )
    try {
      await setTodoDone(userId, id, done)
    } catch {
      setItems((current) =>
        sortTodos(
          current.map((item) => (item.id === id ? { ...item, done: !done } : item)),
        ),
      )
    }
  }

  /**
   * Removes a todo.
   * @param id - Todo id.
   * @returns Nothing.
   */
  async function removeTodo(id: string): Promise<void> {
    if (!userId) {
      return
    }
    const previous = items
    setItems((current) => current.filter((item) => item.id !== id))
    try {
      await deleteTodo(userId, id)
    } catch {
      setItems(previous)
    }
  }

  return { items, loading, addTodo, toggleTodo, removeTodo }
}
