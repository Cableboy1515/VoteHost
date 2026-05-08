"use client"

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
} from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface FormGuard {
  isDirty: () => boolean
  save: () => Promise<boolean>
}

interface GuardContextValue {
  register: (guard: FormGuard) => void
  unregister: () => void
  requestNavigate: (href: string) => void
}

const GuardContext = createContext<GuardContextValue | null>(null)

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const formRef = useRef<FormGuard | null>(null)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (formRef.current?.isDirty()) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  const register = (guard: FormGuard) => { formRef.current = guard }
  const unregister = () => { formRef.current = null }

  function requestNavigate(href: string) {
    if (formRef.current?.isDirty()) {
      setPendingHref(href)
    } else {
      router.push(href)
    }
  }

  async function handleSaveAndContinue() {
    if (!pendingHref || !formRef.current) return
    setSaving(true)
    const ok = await formRef.current.save()
    setSaving(false)
    if (ok) {
      const href = pendingHref
      setPendingHref(null)
      router.push(href)
    }
  }

  function handleDiscard() {
    const href = pendingHref!
    setPendingHref(null)
    router.push(href)
  }

  function handleCancel() {
    setPendingHref(null)
  }

  return (
    <GuardContext.Provider value={{ register, unregister, requestNavigate }}>
      {children}
      {pendingHref && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(2px)" }}
        >
          <div
            className="w-full max-w-sm rounded-[20px] p-6 flex flex-col gap-4"
            style={{
              background: "var(--vh-surface)",
              border: "1px solid var(--vh-line-strong)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
            }}
          >
            <div>
              <p className="text-[16px] font-semibold mb-1" style={{ color: "var(--vh-ink)" }}>
                Unsaved changes
              </p>
              <p className="text-[13.5px]" style={{ color: "var(--vh-muted)" }}>
                You have unsaved changes on this page. What would you like to do?
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveAndContinue}
                className="w-full py-2.5 rounded-[10px] text-[14px] font-medium text-white transition-colors disabled:opacity-60"
                style={{ background: "var(--vh-accent)" }}
                onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "var(--vh-accent-strong)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-accent)" }}
              >
                {saving ? "Saving…" : "Save & continue"}
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={handleDiscard}
                className="w-full py-2.5 rounded-[10px] text-[14px] font-medium transition-colors disabled:opacity-60"
                style={{
                  border: "1px solid var(--vh-danger)",
                  color: "var(--vh-danger)",
                  background: "transparent",
                }}
                onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "var(--vh-danger-soft)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                Discard changes
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={handleCancel}
                className="w-full py-2.5 rounded-[10px] text-[14px] transition-colors disabled:opacity-60"
                style={{
                  border: "1px solid var(--vh-line-strong)",
                  color: "var(--vh-ink-soft)",
                  background: "transparent",
                }}
                onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </GuardContext.Provider>
  )
}

export function useUnsavedChangesGuard(guard: FormGuard) {
  const ctx = useContext(GuardContext)
  const guardRef = useRef(guard)
  guardRef.current = guard

  useEffect(() => {
    if (!ctx) return
    ctx.register({ isDirty: () => guardRef.current.isDirty(), save: () => guardRef.current.save() })
    return () => ctx.unregister()
  }, [ctx])
}

export function useGuardedNavigate() {
  const ctx = useContext(GuardContext)
  const router = useRouter()
  return (href: string) => {
    if (ctx) {
      ctx.requestNavigate(href)
    } else {
      router.push(href)
    }
  }
}

type GuardLinkProps = Omit<Parameters<typeof Link>[0], "onClick"> & {
  children: ReactNode
}

export function GuardLink({ href, children, target, ...rest }: GuardLinkProps) {
  const ctx = useContext(GuardContext)
  const hrefStr = typeof href === "string" ? href : href.toString()

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!ctx) return
    if (target === "_blank") return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return
    e.preventDefault()
    ctx.requestNavigate(hrefStr)
  }

  return (
    <Link href={href} target={target} onClick={handleClick} {...rest}>
      {children}
    </Link>
  )
}
