"use client"

import { useState, useMemo, useEffect } from "react"
import type { Rule } from "@/lib/seatPlan"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { matches } from "@/lib/fold"

interface Guest {
  id: string
  firstname: string
  lastname: string
  seat: { id: string; tableId: string }[]
}

interface Table {
  id: string
  name: string
  seats: {
    id: string
    seat: number
    isBooked: boolean
    userId?: string | null
  }[]
}

interface AssignGuestsDialogProps {
  isOpen: boolean
  onClose: () => void
  guests: Guest[]
  tables: Table[]
  onAssignGuests: (guestIds: string[], tableId: string) => Promise<void>
}

export function AssignGuestsDialog({ isOpen, onClose, guests, tables, onAssignGuests }: AssignGuestsDialogProps) {
  const [selectedGuests, setSelectedGuests] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState<string>("")
  const [isAssigning, setIsAssigning] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  // Guests assigned while this window is open: hidden right away, counted for the "Done" summary
  const [justAssigned, setJustAssigned] = useState<string[]>([])
  // keep together / keep apart rules, to warn before assigning
  const [rules, setRules] = useState<Rule[]>([])
  useEffect(() => {
    if (!isOpen) return
    fetch("/api/seating-rules")
      .then((r) => r.json())
      .then((j) => j?.success && setRules(j.rules))
      .catch(() => undefined)
  }, [isOpen])

  // guests without a seat, A–Z by last name
  const availableGuests = guests
    .filter((guest) => guest.seat.length === 0 && !justAssigned.includes(guest.id))
    .sort((a, b) =>
      `${a.lastname} ${a.firstname}`.localeCompare(`${b.lastname} ${b.firstname}`, undefined, { sensitivity: "base" }),
    )
  const availableTables = tables.filter((table) => table.seats.some((seat) => !seat.isBooked))

  // Filter guests by search
  const filteredGuests = useMemo(() => {
    if (!searchValue) return availableGuests
    return availableGuests.filter((g) => matches(`${g.firstname} ${g.lastname}`, searchValue))
  }, [searchValue, availableGuests])

  // Empty seats at the chosen table
  const freeSeats = (() => {
    const t = tables.find((x) => x.id === selectedTable)
    return t ? t.seats.filter((s) => !s.isBooked).length : 0
  })()
  // One click: pick as many guests (from the list shown) as the table has empty seats
  const fillTable = () => {
    const picked = [...selectedGuests]
    for (const g of filteredGuests) {
      if (picked.length >= freeSeats) break
      if (!picked.includes(g.id)) picked.push(g.id)
    }
    setSelectedGuests(picked.slice(0, freeSeats))
  }

  // Warnings for the current choice: not enough seats, or a seating rule broken
  const warnings = (() => {
    const out: string[] = []
    const t = tables.find((x) => x.id === selectedTable)
    if (!t) return out
    if (selectedGuests.length > freeSeats)
      out.push(
        `${t.name} has only ${freeSeats} empty seat${freeSeats === 1 ? "" : "s"}: unselect ${selectedGuests.length - freeSeats} guest${selectedGuests.length - freeSeats === 1 ? "" : "s"} or pick another table.`,
      )
    const name = (id: string) => {
      const g = guests.find((x) => x.id === id)
      return g ? `${g.firstname} ${g.lastname}` : "a guest"
    }
    const there = new Set([...selectedGuests, ...t.seats.filter((s) => s.isBooked && s.userId).map((s) => s.userId!)])
    const tableOfGuest = (id: string) => guests.find((x) => x.id === id)?.seat[0]?.tableId ?? null
    for (const r of rules) {
      const picked = selectedGuests.includes(r.a) || selectedGuests.includes(r.b)
      if (!picked) continue
      if (r.kind === "apart" && there.has(r.a) && there.has(r.b))
        out.push(`${name(r.a)} and ${name(r.b)} should not sit at the same table.`)
      if (r.kind === "together") {
        const other = selectedGuests.includes(r.a) ? r.b : r.a
        const ot = tableOfGuest(other)
        if (!there.has(other) && ot && ot !== selectedTable)
          out.push(`${name(selectedGuests.includes(r.a) ? r.a : r.b)} should sit with ${name(other)} (${tables.find((x) => x.id === ot)?.name ?? "another table"}).`)
      }
    }
    return out
  })()

  const handleGuestToggle = (guestId: string) => {
    setSelectedGuests((prev) =>
      prev.includes(guestId) ? prev.filter((id) => id !== guestId) : [...prev, guestId],
    )
  }

  const handleAssign = async () => {
    if (!selectedTable) {
      toast.error("Please select a table")
      return
    }

    if (selectedGuests.length === 0) {
      toast.error("Please select at least one guest")
      return
    }

    const selectedTableData = tables.find((t) => t.id === selectedTable)
    if (!selectedTableData) return

    const availableSeats = selectedTableData.seats.filter((seat) => !seat.isBooked).length

    if (selectedGuests.length > availableSeats) {
      toast.error(
        <div className="flex flex-col gap-1">
          <div className="font-semibold">Not enough seats available</div>
          <div className="text-sm">{selectedGuests.length - availableSeats} guest(s) cannot be assigned</div>
        </div>,
      )
      return
    }

    setIsAssigning(true)
    try {
      await onAssignGuests(selectedGuests, selectedTable)
      const n = selectedGuests.length
      toast.success(`${n} guest${n === 1 ? "" : "s"} assigned to ${selectedTableData.name}`)
      // Stay open so the next group can be assigned; "Done" closes the window
      setJustAssigned((prev) => [...prev, ...selectedGuests])
      setSelectedGuests([])
      setSelectedTable("")
      setSearchValue("")
    } catch (error) {
      console.error(error)
      toast.error("Failed to assign guests")
    } finally {
      setIsAssigning(false)
    }
  }

  const handleDone = () => {
    setSelectedGuests([])
    setSelectedTable("")
    setSearchValue("")
    setJustAssigned([])
    onClose()
  }

  const getTableAvailability = (table: Table) => {
    const totalSeats = table.seats.length
    const bookedSeats = table.seats.filter((seat) => seat.isBooked).length
    return `${totalSeats - bookedSeats} of ${totalSeats} seats available`
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDone()}>
      <DialogContent
        className="max-w-4xl max-h-[95vh] overflow-y-auto"
        // Clicking outside or pressing Esc must not close it; only "Done" (or the X) does
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Assign Multiple Guests</DialogTitle>
          {justAssigned.length > 0 && (
            <p className="text-sm text-green-700">
              ✓ {justAssigned.length} guest{justAssigned.length === 1 ? "" : "s"} assigned so far. Keep going, or click Done when finished.
            </p>
          )}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 mt-4">
          {/* Left side - Guest selection with search */}
          <div className="space-y-4">
            <h3 className="font-semibold">Select Guests</h3>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search guests..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="pl-9"
              />
            </div>

            <ScrollArea className="h-[min(360px,45vh)] border rounded-lg p-4">
              {filteredGuests.length > 0 ? (
                filteredGuests.map((guest) => (
                  <div
                    key={guest.id}
                    className="flex items-center space-x-3 py-2 px-2 hover:bg-muted rounded-lg"
                  >
                    <Checkbox
                      checked={selectedGuests.includes(guest.id)}
                      onCheckedChange={() => handleGuestToggle(guest.id)}
                    />
                    <Label className="cursor-pointer flex-1">
                      {guest.firstname} {guest.lastname}
                    </Label>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">No guests found</div>
              )}
            </ScrollArea>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                {selectedGuests.length} guests selected
                {selectedTable ? ` · ${freeSeats} empty seats at this table` : ""}
              </span>
              {selectedTable && freeSeats > 0 && (
                <Button
                  size="sm"
                  onClick={fillTable}
                  disabled={selectedGuests.length >= freeSeats || filteredGuests.length === 0}
                  title="Select the next guests in the list, as many as the table has empty seats"
                >
                  Select {freeSeats} guests for this table
                </Button>
              )}
              {selectedGuests.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setSelectedGuests([])}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Right side - Table selection */}
          <div className="space-y-4">
            <h3 className="font-semibold">Select Table</h3>
            <ScrollArea className="h-[calc(min(360px,45vh)+3.5rem)] border rounded-lg p-4">
              <RadioGroup value={selectedTable} onValueChange={setSelectedTable}>
                {availableTables.map((table) => (
                  <div
                    key={table.id}
                    className="flex items-center space-x-3 py-2 px-2 hover:bg-muted rounded-lg"
                  >
                    <RadioGroupItem value={table.id} id={table.id} />
                    <Label htmlFor={table.id} className="flex-1">
                      <div className="flex justify-between items-center">
                        <span>{table.name}</span>
                        <span className="text-sm text-muted-foreground">{getTableAvailability(table)}</span>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </ScrollArea>
            {warnings.length > 0 && (
              <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">
                {warnings.map((w) => (
                  <p key={w}>⚠ {w}</p>
                ))}
              </div>
            )}
            {/* Assign right under the tables, on the same line as "Select 10 guests" */}
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDone}>
                Done
              </Button>
              <Button size="sm" onClick={handleAssign} disabled={isAssigning || !selectedTable || selectedGuests.length === 0 || selectedGuests.length > freeSeats}>
                {isAssigning
                  ? "Assigning..."
                  : selectedTable
                  ? `Assign ${selectedGuests.length || ""} to ${tables.find((t) => t.id === selectedTable)?.name ?? "table"}`.replace("  ", " ")
                  : "Assign Guests"}
              </Button>
            </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}
