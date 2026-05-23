"use client"

import { createContext, useContext } from "react"

const TimezoneContext = createContext<string>("UTC")

export function TimezoneProvider({ value, children }: { value: string; children: React.ReactNode }) {
  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>
}

export function useDisplayTimeZone(): string {
  return useContext(TimezoneContext)
}
