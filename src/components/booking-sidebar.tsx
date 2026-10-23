import { Button } from "@/components/ui/button";
import { fold, matches } from "@/lib/fold";
import { useGuestNotes } from "@/hooks/useGuestNotes";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Seat } from "@/types/booking";
import { ChevronLeft, ChevronRight, Download, Search, Trash2, User } from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import PasswordVerificationDialog from "./password-verification-dialog";

interface BookingSidebarProps {
  bookedSeats: Seat[];
  onDeleteBooking: (seatId: string, guestId?: string) => void;
  onToggleReceived: (seatId: string, isReceived: boolean) => void;
  onDeleteAll?: () => void; // only the admin can delete everything
  // Full-screen floor plan: just the names, no Export / Delete All buttons
  compact?: boolean;
  // check-in only account: no "remove from seat" bins
  readOnly?: boolean;
  // check a guest in straight away (after reading their note)
  onCheckInNow?: (seatId: string) => void;
}

export function BookingSidebar({
  bookedSeats,
  onDeleteBooking,
  onToggleReceived,
  onDeleteAll,
  compact = false,
  readOnly = false,
  onCheckInNow,
}: BookingSidebarProps) {
  // guests with a note (seat hidden from their phone until the desk says yes)
  const { notes } = useGuestNotes();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQueries, setSearchQueries] = useState({
    name: "",
    seat: "",
  });
  const [isExporting, setIsExporting] = useState(false);
  const isTablet = useMediaQuery("(min-width: 200px) and (max-width: 1279px)");

  // Delete booking dialog states
  const [isDeleteBookingDialogOpen, setIsDeleteBookingDialogOpen] =
    useState(false);
  const [deleteBookingPassword, setDeleteBookingPassword] = useState("");
  const [showDeleteBookingPassword, setShowDeleteBookingPassword] =
    useState(false);
  const [deleteBookingConfirmText, setDeleteBookingConfirmText] = useState("");
  const [seatToDelete, setSeatToDelete] = useState<string | null>(null);

  const handleDeleteBookingConfirm = async () => {
    try {
      if (seatToDelete) {
        onDeleteBooking(seatToDelete, guestToDelete ?? undefined);
        setGuestToDelete(null);
        setIsDeleteBookingDialogOpen(false);
        setDeleteBookingConfirmText("");
        setDeleteBookingPassword("");
        setSeatToDelete(null);
      }
    } catch (error) {
      console.log(error);
      toast.error("Delete Failed", {
        description: "An error occurred while processing your request",
      });
    }
  };

  // Excel export function
  const handleExportToExcel = async () => {
    try {
      setIsExporting(true);
      
      // Prepare data for Excel export
      const exportData = filteredBookings.map((seat, index) => ({
        'S.No': index + 1,
        'First Name': seat.user?.firstname || '',
        'Last Name': seat.user?.lastname || '',
        'Full Name': `${seat.user?.firstname || ''} ${seat.user?.lastname || ''}`.trim(),
        'Table Name': seat.table.name || '',
        'Seat Number': seat.seat,
        'Booking ID': seat.id,
        'Arrival Status': seat.isReceived ? 'Arrived' : 'Not Arrived',
        'Booking Date': new Date().toLocaleDateString(), // You can replace this with actual booking date if available
      }));

      

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // Set column widths for better formatting
      const columnWidths = [
        { wch: 8 },   // S.No
        { wch: 15 },  // First Name
        { wch: 15 },  // Last Name
        { wch: 25 },  // Full Name
        { wch: 20 },  // Table Name
        { wch: 12 },  // Seat Number
        { wch: 25 },  // Booking ID
        { wch: 15 },  // Arrival Status
        { wch: 15 },  // Booking Date
      ];
      worksheet['!cols'] = columnWidths;

      // Make header row bold
      const headerCells = ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1', 'I1'];
      headerCells.forEach(cell => {
        if (worksheet[cell]) {
          worksheet[cell].s = {
            font: { bold: true }
          };
        }
      });

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Bookings');

      // Generate filename with current date and time
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS format
      const filename = `bookings_export_${dateStr}_${timeStr}.xlsx`;

      // Write and download file
      XLSX.writeFile(workbook, filename);

      toast.success("Export Successful", {
        description: `${filteredBookings.length} bookings exported to ${filename}`,
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast.error("Export Failed", {
        description: "An error occurred while exporting the bookings",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Move filtering logic to useMemo
  const filteredBookings = useMemo(() => {
    const q = searchQueries.name.trim().toLowerCase();
    const fullName = (seat: Seat) =>
      `${seat.user?.firstname ?? ""} ${seat.user?.lastname ?? ""}`.trim();
    return bookedSeats
      // search by guest name or table name
      .filter(
        (seat) =>
          !q ||
          matches(fullName(seat), q) ||
          matches(seat.table?.name, q)
      )
      // by last name, then first name
      .sort((a, b) => {
        const last = (x: Seat) => `${x.user?.lastname ?? ""} ${x.user?.firstname ?? ""}`;
        return last(a).localeCompare(last(b), undefined, { sensitivity: "base" });
      });
  }, [bookedSeats, searchQueries]);

  // The same name on the list more than once (same first + last name,
  // ignoring capitals and accents): shown in light red until one is removed
  const dupKey = (seat: Seat) => fold(`${seat.user?.firstname ?? ""} ${seat.user?.lastname ?? ""}`).replace(/\s+/g, " ").trim();
  const dupes = useMemo(() => {
    const n = new Map<string, number>();
    for (const s of bookedSeats) if (s.user) n.set(dupKey(s), (n.get(dupKey(s)) ?? 0) + 1);
    return new Set([...n].filter(([k, c]) => k && c > 1).map(([k]) => k));
  }, [bookedSeats]);
  const [onlyDupes, setOnlyDupes] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [guestToDelete, setGuestToDelete] = useState<string | null>(null);
  const showOnlyDupes = onlyDupes && dupes.size > 0;

  // On screen: guests who have not arrived yet. Arrived guests only show
  // when searched for (to undo a mistake), or when looking at duplicates.
  const visibleBookings = useMemo(
    () =>
      showOnlyDupes
        ? filteredBookings.filter((s) => dupes.has(dupKey(s)))
        : searchQueries.name.trim()
        ? filteredBookings
        : filteredBookings.filter((s) => !s.isReceived),
    [filteredBookings, searchQueries, showOnlyDupes, dupes]
  );
  const searchRef = useRef<HTMLInputElement>(null);
  // Ticking a guest marks them arrived: their name pops out on the floor
  // plan and moves to the Arrived list on the left (and leaves this list)
  const markArrived = (seat: Seat) => onToggleReceived(seat.id, true);

  // Memoized search input handlers
  const handleSearchChange =
    (field: "name" | "seat") => (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQueries((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
    };

  // Memoized sidebar content
  const SidebarContent = useMemo(
    () => (
      <div className="flex flex-col h-full w-full bg-white">
        <div className="px-2 py-3 bg-white shadow-sm space-y-2">
          {/* Title centred; search box and list share the same edges */}
          <div className="relative flex items-center justify-center">
            <h2 className="text-xl font-bold text-gray-800 whitespace-nowrap text-center">Guest Names</h2>
            {!readOnly && (
              // drop a name here to delete it (asks first)
              <div
                className={`absolute right-0 flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed transition-all ${
                  overTrash ? "scale-125 border-red-600 bg-red-600 text-white" : "border-red-300 bg-red-50 text-red-500"
                }`}
                title="Drag a guest's name here to delete it"
                aria-label="Delete: drop a guest's name here"
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("application/x-seating4u-guest")) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverTrash(true);
                }}
                onDragLeave={() => setOverTrash(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverTrash(false);
                  try {
                    const g = JSON.parse(e.dataTransfer.getData("application/x-seating4u-guest"));
                    if (!g?.seatId) return;
                    setSeatToDelete(g.seatId);
                    setGuestToDelete(g.userId ?? null);
                    setIsDeleteBookingDialogOpen(true);
                  } catch {
                    /* not a guest */
                  }
                }}
              >
                <Trash2 className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className={`flex gap-2 justify-center ${bookedSeats.length > 0 && !compact ? "" : "hidden"}`}>
              {bookedSeats.length > 0 && !compact && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportToExcel}
                    disabled={isExporting || filteredBookings.length === 0}
                    className="text-xs flex items-center gap-1"
                  >
                    <Download className="h-3 w-3" />
                    {isExporting ? 'Exporting...' : 'Export in Excel'}
                  </Button>
                  {onDeleteAll && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onDeleteAll}
                    className="text-xs"
                  >
                    Delete All
                  </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {dupes.size > 0 && (
            <div className="keep-ink flex items-center gap-2 rounded-md border border-red-300 bg-red-100 px-2 py-1.5 text-xs text-red-900">
              <span className="flex-1">
                <b>{dupes.size} name{dupes.size === 1 ? " is" : "s are"} on the list more than once</b> (light red).{" "}
                {readOnly ? "Ask the guest which table is theirs before checking them in." : "Drag the extra one onto the red bin to delete it."}
              </span>
              <button type="button" onClick={() => setOnlyDupes((v) => !v)} className="shrink-0 rounded border border-red-400 bg-white px-2 py-0.5 font-semibold hover:bg-red-50">
                {showOnlyDupes ? "Show all" : "Show them"}
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <div className="relative w-full">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Search name or table..."
                value={searchQueries.name}
                onChange={handleSearchChange("name")}
                className="pl-8"
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 px-2 py-0.5">
          <div>
            {visibleBookings.length > 0 ? (
              // A table so the columns line up: [arrived] Name   Table 1  [delete]
              <table className="w-auto text-sm border-collapse">
                <tbody>
                  {visibleBookings.map((seat) =>
                    seat.isReceived ? (
                      // Searched for someone who already arrived: a small note
                      <tr key={seat.id}>
                        <td colSpan={4} className="py-1">
                          <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-2 py-1.5 shadow-sm">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">✓</span>
                            <span className="text-sm text-green-900">
                              <b>{seat.user?.firstname} {seat.user?.lastname}</b> arrived · {seat.table.name}
                            </span>
                            <button
                              type="button"
                              className="ml-auto text-[11px] text-green-800 underline hover:text-red-600"
                              onClick={() => onToggleReceived(seat.id, false)}
                              title="Marked by mistake? Put them back on the guest list"
                            >
                              undo
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                    <Fragment key={seat.id}>
                    <tr
                      className={`border-b border-gray-100 ${dupes.has(dupKey(seat)) ? "keep-ink bg-red-100" : seat.isReceived ? "bg-green-50/70" : ""} ${seat.user ? "cursor-grab active:cursor-grabbing" : ""}`}
                      // drag a name onto a table on the floor plan to move the guest there
                      draggable={!!seat.user && !readOnly}
                      onDragStart={(e) => {
                        if (!seat.user) return;
                        e.dataTransfer.setData(
                          "application/x-seating4u-guest",
                          JSON.stringify({ seatId: seat.id, userId: seat.user.id, name: `${seat.user.firstname} ${seat.user.lastname}`.trim(), tableId: seat.table?.id })
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      title={
                        dupes.has(dupKey(seat))
                          ? readOnly
                            ? "This name is on the list more than once: ask the guest which table is theirs."
                            : "This name is on the list more than once. Drag the extra one onto the red bin to delete it."
                          : "Drag onto a table to move this guest, or onto the red bin to delete"
                      }
                    >
                      <td className="py-0.5 pr-1.5 align-middle">
                        <Checkbox
                          id={`received-${seat.id}`}
                          checked={seat.isReceived}
                          onCheckedChange={() => markArrived(seat)}
                          aria-label={`${seat.user?.firstname} ${seat.user?.lastname} arrived`}
                          title="Arrived"
                        />
                      </td>
                      <td className="py-0.5 pr-6 align-middle whitespace-nowrap">
                        {/* only the box marks arrival; clicking the name does nothing */}
                        <span className="font-medium text-gray-900 select-text">
                          {seat.user?.vip && <span className="mr-1 text-amber-500" title="VIP">★</span>}
                          {seat.user?.firstname} {seat.user?.lastname}
                        </span>
                        {seat.user && notes[seat.user.id] && (
                          <span
                            className="ml-1.5 rounded bg-amber-100 px-1 text-[11px] font-bold text-amber-800"
                            title={notes[seat.user.id]}
                          >
                            📝 Note
                          </span>
                        )}
                      </td>
                      <td className="py-0.5 pr-2 align-middle text-xs text-gray-500 whitespace-nowrap">
                        {seat.table.name}
                      </td>
                      <td className="py-0.5 align-middle">
                        {!readOnly && <button
                          type="button"
                          onClick={() => {
                            setSeatToDelete(seat.id);
                            setIsDeleteBookingDialogOpen(true);
                          }}
                          className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                          title="Remove from this seat"
                          aria-label="Remove from this seat"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>}
                      </td>
                    </tr>
                    {/* Searched for a guest with a note: show it right here, with Yes / No */}
                    {searchQueries.name.trim() && seat.user && notes[seat.user.id] && (
                      <tr>
                        <td colSpan={4} className="pb-2 pt-0.5">
                          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-2 shadow">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                              📝 Note for {seat.user.firstname} {seat.user.lastname}
                            </p>
                            <p className="whitespace-pre-wrap text-sm font-semibold text-amber-950">{notes[seat.user.id]}</p>
                            <p className="mt-1.5 text-xs font-medium text-zinc-700">Give them their seat ({seat.table.name}) and check them in?</p>
                            <div className="mt-1 flex gap-2">
                              <button
                                type="button"
                                className="flex-1 rounded-md bg-green-600 px-2 py-1 text-sm font-semibold text-white hover:bg-green-700"
                                onClick={() => (onCheckInNow ? onCheckInNow(seat.id) : onToggleReceived(seat.id, true))}
                              >
                                Yes…
                              </button>
                              <button
                                type="button"
                                className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-semibold hover:bg-zinc-50"
                                onClick={() => setSearchQueries((p) => ({ ...p, name: "" }))}
                              >
                                No
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    )
                  )}
                </tbody>
              </table>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <User className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="text-sm font-medium">
                  {!searchQueries.name.trim() && filteredBookings.length > 0
                    ? "Everyone has arrived ✓"
                    : "No bookings found"}
                </p>
                {(searchQueries.name || searchQueries.seat) && (
                  <p className="text-xs text-gray-400 mt-1">
                    Try adjusting your search criteria
                  </p>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <PasswordVerificationDialog
          open={isDeleteBookingDialogOpen}
          onOpenChange={(open) => {
            setIsDeleteBookingDialogOpen(open);
            if (!open) {
              setDeleteBookingConfirmText("");
              setDeleteBookingPassword("");
              setShowDeleteBookingPassword(false);
              setSeatToDelete(null);
              setGuestToDelete(null);
            }
          }}
          simple={true}
          onVerified={handleDeleteBookingConfirm}
          action={(() => {
            const st = bookedSeats.find((x) => x.id === seatToDelete);
            const nm = st?.user ? `${st.user.firstname} ${st.user.lastname}`.trim() : "this guest";
            return guestToDelete ? `delete ${nm}${st ? ` (${st.table.name})` : ""} from the guest list` : "delete booking";
          })()}
          confirmText="Delete Booking"
          confirmTextDisplay="Delete Booking"
        />
      </div>
    ),
    [
      bookedSeats,
      searchQueries,
      onDeleteBooking,
      onToggleReceived,
      onDeleteAll,
      compact,
      readOnly,
      notes,
      onCheckInNow,
      filteredBookings,
      visibleBookings,
      isDeleteBookingDialogOpen,
      deleteBookingConfirmText,
      deleteBookingPassword,
      showDeleteBookingPassword,
      seatToDelete,
      isExporting,
      dupes,
      showOnlyDupes,
      overTrash,
      guestToDelete,
    ]
  );

  if (isTablet) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="fixed right-0 top-1/2 -translate-y-1/2 z-50"
          >
            {isOpen ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] p-0">
          {SidebarContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="w-full h-full max-w-xs lg:max-w-sm xl:max-w-md">
      {SidebarContent}
    </div>
  );
}