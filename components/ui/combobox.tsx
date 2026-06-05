"use client"

import * as React from "react"
import { Autocomplete } from "@base-ui/react/autocomplete"
import { cn } from "@/lib/utils"

export interface MergeComboboxProps {
  value: string
  onValueChange: (value: string) => void
  /** Candidate strings to show in the filtered dropdown. */
  suggestions: string[]
  placeholder?: string
  disabled?: boolean
  maxLength?: number
  "aria-label"?: string
  /** Forwarded to the inner <input> element (border, background, etc.). */
  style?: React.CSSProperties
  className?: string
  /** Called when Enter is pressed and the popup is closed (no item being selected). */
  onEnterKey?: () => void
}

/**
 * Free-text input with a filtered suggestion dropdown.
 * Wraps @base-ui/react Autocomplete — a drop-in replacement for the plain
 * write-in merge <input> that still lets the admin type any arbitrary canonical name.
 *
 * Selecting a suggestion fills the input (and fires onValueChange) but does NOT
 * auto-save — the admin must still click Save or press Enter with the popup closed.
 */
export function MergeCombobox({
  value,
  onValueChange,
  suggestions,
  placeholder,
  disabled,
  maxLength,
  "aria-label": ariaLabel,
  style,
  className,
  onEnterKey,
}: MergeComboboxProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <Autocomplete.Root
      value={value}
      onValueChange={(v) => onValueChange(v)}
      items={suggestions}
      openOnInputClick
      onOpenChange={setIsOpen}
    >
      <Autocomplete.Input
        data-slot="merge-combobox-input"
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isOpen && onEnterKey) {
            onEnterKey()
          }
        }}
        className={cn("w-full text-sm rounded-[8px] px-2.5 py-1.5", className)}
        style={{
          outline: "none",
          opacity: disabled ? 0.6 : 1,
          ...style,
        }}
      />

      {suggestions.length > 0 && (
        <Autocomplete.Portal>
          <Autocomplete.Positioner
            sideOffset={4}
            className="isolate z-50"
          >
            <Autocomplete.Popup
              data-slot="merge-combobox-popup"
              className={cn(
                "relative z-50 max-h-60 w-(--anchor-width) min-w-40 overflow-y-auto",
                "origin-(--transform-origin) rounded-[10px] bg-popover text-popover-foreground",
                "shadow-lg ring-1 ring-foreground/10",
                "duration-100",
                "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
                "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
              )}
            >
              <Autocomplete.List className="p-1">
                {suggestions.map((s) => (
                  <Autocomplete.Item
                    key={s}
                    value={s}
                    data-slot="merge-combobox-item"
                    className={cn(
                      "relative flex w-full cursor-default select-none items-center gap-1.5",
                      "rounded-[6px] px-2.5 py-1.5 text-sm outline-none",
                      "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                      "data-disabled:pointer-events-none data-disabled:opacity-50"
                    )}
                  >
                    {s}
                  </Autocomplete.Item>
                ))}
              </Autocomplete.List>
              <Autocomplete.Empty className="px-2.5 py-3 text-center text-sm text-muted-foreground">
                No matches
              </Autocomplete.Empty>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      )}
    </Autocomplete.Root>
  )
}
