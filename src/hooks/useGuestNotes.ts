"use client"

import useSWR from "swr"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Failed to load notes")
  return res.json()
}

// { [guestId]: "note" } for the open event, kept fresh
export function useGuestNotes() {
  const { data, mutate } = useSWR<{ success: boolean; data: Record<string, string> }>("/api/guest-notes", fetcher, {
    refreshInterval: 5000,
  })
  const notes = data?.data ?? {}
  const saveNote = async (id: string, note: string) => {
    const next = { ...notes }
    if (note.trim()) next[id] = note.trim()
    else delete next[id]
    mutate({ success: true, data: next }, false)
    await fetch("/api/guest-notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, note }),
    })
    mutate()
  }
  return { notes, saveNote, refresh: mutate }
}
