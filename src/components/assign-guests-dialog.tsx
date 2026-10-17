"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

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

  // guests without a seat, A–Z by last name
  const availableGuests = guests
    .filter((guest) => guest.seat.length === 0)
    .sort((a, b) =>
      `${a.lastname} ${a.firstname}`.localeCompare(`${b.lastname} ${b.firstname}`, undefined, { sensitivity: "base" }),
    )
  const availableTables = tables.filter((table) => table.seats.some((seat) => !seat.isBooked))

  // Filter guests by search
  const filteredGuests = useMemo(() => {
    if (!searchValue) return availableGuests
    const term = searchValue.toLowerCase()
    return availableGuests.filter(
      (g) =>
        g.firstname.toLowerCase().includes(term) ||
        g.lastname.toLowerCase().includes(term) ||
        `${g.firstname} ${g.lastname}`.toLowerCase().includes(term),
    )
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
      toast.success("Guests assigned successfully")
      setSelectedGuests([])
      setSelectedTable("")
      setSearchValue("")
      onClose()
    } catch (error) {
      console.error(error)
      toast.error("Failed to assign guests")
    } finally {
      setIsAssigning(false)
    }
  }

  const getTableAvailability = (table: Table) => {
    const totalSeats = table.seats.length
    const bookedSeats = table.seats.filter((seat) => seat.isBooked).length
    return `${totalSeats - bookedSeats} of ${totalSeats} seats available`
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Multiple Guests</DialogTitle>
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
            {/* Assign right under the tables, on the same line as "Select 10 guests" */}
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAssign} disabled={isAssigning || !selectedTable || selectedGuests.length === 0}>
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
