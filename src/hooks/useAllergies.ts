"use client"

import useSWR from "swr"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Failed to load allergies")
  return res.json()
}

// { [guestId]: "Nut allergy" } for the open event, kept fresh
export function useAllergies() {
  const { data, mutate } = useSWR<{ success: boolean; data: Record<string, string> }>("/api/allergies", fetcher, {
    refreshInterval: 5000,
  })
  const allergies = data?.data ?? {}
  const saveAllergy = async (id: string, allergy: string) => {
    const next = { ...allergies }
    if (allergy.trim()) next[id] = allergy.trim()
    else delete next[id]
    mutate({ success: true, data: next }, false)
    await fetch("/api/allergies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, allergy }),
    })
    mutate()
  }
  return { allergies, saveAllergy, refresh: mutate }
}
