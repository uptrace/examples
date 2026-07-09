// todos-context.tsx — the in-memory todo list plus the wiring from each action
// to its Sentry signal. State is useState only; there is no backend. Open todos
// hold a span in `spans` until they are completed or deleted.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Span } from '@sentry/react'
import {
  breadcrumb,
  endTodoSpan,
  logAdded,
  logDeleted,
  openTodoSpan,
} from './telemetry'

// Todo is a single item in the list.
export interface Todo {
  id: string
  text: string
  done: boolean
}

// Filter is which todos the list is showing.
export type Filter = 'all' | 'active' | 'completed'

// TodosValue is the state and actions exposed to the pages.
interface TodosValue {
  todos: Todo[]
  filter: Filter
  addTodo: (text: string) => void
  toggleTodo: (id: string) => void
  deleteTodo: (id: string) => void
  clearCompleted: () => void
  setFilter: (f: Filter) => void
}

const TodosContext = createContext<TodosValue | null>(null)

// TodosProvider holds the list so both routes (`/` and `/todo/:id`) share it,
// and turns each action into the matching Sentry signal.
export function TodosProvider({ children }: { children: ReactNode }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [filter, setFilterState] = useState<Filter>('all')
  // Open todos' spans, keyed by todo id. Ended on completion or deletion.
  const spans = useRef(new Map<string, Span>()).current

  const addTodo = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text) {
        return
      }
      const id = crypto.randomUUID()
      setTodos((prev) => [{ id, text, done: false }, ...prev])
      breadcrumb(`Added todo "${text}"`)
      logAdded(id, text)
      spans.set(id, openTodoSpan(id, text))
    },
    [spans],
  )

  const toggleTodo = useCallback(
    (id: string) => {
      const todo = todos.find((t) => t.id === id)
      if (!todo) {
        return
      }
      const done = !todo.done
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)))
      const span = spans.get(id)
      if (done) {
        // Completing ends the open span, sending its measured duration.
        if (span) {
          endTodoSpan(span)
          spans.delete(id)
        }
      } else if (!span) {
        // Reopening starts a fresh span.
        spans.set(id, openTodoSpan(id, todo.text))
      }
      breadcrumb(`${done ? 'Completed' : 'Reopened'} todo "${todo.text}"`)
    },
    [todos, spans],
  )

  const deleteTodo = useCallback(
    (id: string) => {
      const todo = todos.find((t) => t.id === id)
      setTodos((prev) => prev.filter((t) => t.id !== id))
      const span = spans.get(id)
      if (span) {
        // Deleting an open (not-yet-done) todo cancels its span.
        endTodoSpan(span, { cancelled: todo ? !todo.done : true })
        spans.delete(id)
      }
      if (todo) {
        breadcrumb(`Deleted todo "${todo.text}"`)
        logDeleted(id, todo.text)
      }
    },
    [todos, spans],
  )

  const clearCompleted = useCallback(() => {
    // Completed todos already ended their spans when toggled done.
    setTodos((prev) => prev.filter((t) => !t.done))
    breadcrumb('Cleared completed todos')
  }, [])

  const setFilter = useCallback((f: Filter) => {
    setFilterState(f)
    breadcrumb(`Filtered by "${f}"`)
  }, [])

  useEffect(() => {
    // End any still-open spans on unmount so none leak unsent.
    return () => {
      for (const span of spans.values()) {
        endTodoSpan(span, { cancelled: true })
      }
      spans.clear()
    }
  }, [spans])

  const value: TodosValue = {
    todos,
    filter,
    addTodo,
    toggleTodo,
    deleteTodo,
    clearCompleted,
    setFilter,
  }

  return <TodosContext.Provider value={value}>{children}</TodosContext.Provider>
}

// useTodos reads the shared todo state. Throws if used outside the provider.
export function useTodos(): TodosValue {
  const value = useContext(TodosContext)
  if (!value) {
    throw new Error('useTodos must be used within a TodosProvider')
  }
  return value
}
