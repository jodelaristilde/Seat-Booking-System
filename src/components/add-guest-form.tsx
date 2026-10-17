"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface AddGuestFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  // tables to seat the guest at (name + seats), optional
  tables?: { id: string; name: string; seats: { isBooked: boolean }[] }[]
}

const MEALS = ["Chicken", "Fish", "Beef", "Veg", "Kids"]

export function AddGuestForm({ isOpen, onClose, onSuccess, tables = [] }: AddGuestFormProps) {
  const [firstname, setFirstname] = useState("")
  const [lastname, setLastname] = useState("")
  const [table, setTable] = useState("")
  const [meal, setMeal] = useState("")
  const [vip, setVip] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const sortedTables = [...tables].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  )

  const reset = () => {
    setFirstname("")
    setLastname("")
    setTable("")
    setMeal("")
    setVip(false)
    setArrived(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch("/api/add-guest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstname,
          lastname,
          table: table || undefined,
          meal: meal.trim() || undefined,
          vip,
          arrived: !!table && arrived,
        }),
      })

      const data = await response.json()

      if (data.success) {
        const who = `${firstname.trim()} ${lastname.trim()}`
        toast.success(
          data.seatedAt
            ? `${who} added to ${data.seatedAt}${arrived ? " and checked in" : ""}`
            : `${who} added`,
        )
        reset()
        onSuccess()
        onClose()
      } else {
        toast.error("Failed to add guest", {
          description: data.error,
        })
      }
    } catch (error) {
      toast.error("Failed to add guest", {
        description: `An unexpected error occurred | ${error}`,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Guest</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor="firstname" className="text-sm font-medium">
                First Name
              </label>
              <Input
                id="firstname"
                value={firstname}
                onChange={(e) => setFirstname(e.target.value)}
                placeholder="Enter first name"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="lastname" className="text-sm font-medium">
                Last Name
              </label>
              <Input
                id="lastname"
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
                placeholder="Enter last name"
                required
              />
            </div>
          </div>

          {/* Seat them right away (optional) */}
          <div className="space-y-2">
            <label htmlFor="guest-table" className="text-sm font-medium">
              Table <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <select
              id="guest-table"
              value={table}
              onChange={(e) => setTable(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Seat later</option>
              {sortedTables.map((t) => {
                const free = t.seats.filter((s) => !s.isBooked).length
                return (
                  <option key={t.id} value={t.name}>
                    {t.name} · {free > 0 ? `${free} empty seat${free === 1 ? "" : "s"}` : "full (a seat is added)"}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Meal (optional) */}
          <div className="space-y-2">
            <label htmlFor="guest-meal" className="text-sm font-medium">
              Meal <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MEALS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMeal(meal === m ? "" : m)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    meal === m ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white hover:bg-zinc-50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <Input
              id="guest-meal"
              value={meal}
              maxLength={40}
              onChange={(e) => setMeal(e.target.value)}
              placeholder="Or type another meal (e.g. Vegan, no nuts)"
            />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} className="h-4 w-4" />
              <span className="text-amber-500">★</span> VIP
            </label>
            <label className={`flex items-center gap-2 text-sm ${table ? "cursor-pointer" : "opacity-50"}`}>
              <input
                type="checkbox"
                checked={arrived}
                disabled={!table}
                onChange={(e) => setArrived(e.target.checked)}
                className="h-4 w-4"
              />
              Here now: check them in
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Adding..." : "Add Guest"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
