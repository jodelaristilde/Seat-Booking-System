import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Seat } from "@/types/booking";
import { ChevronLeft, ChevronRight, Download, Search, Trash2, User } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import PasswordVerificationDialog from "./password-verification-dialog";

interface BookingSidebarProps {
  bookedSeats: Seat[];
  onDeleteBooking: (seatId: string) => void;
  onToggleReceived: (seatId: string, isReceived: boolean) => void;
  onDeleteAll: () => void;
  // Full-screen floor plan: just the names, no Export / Delete All buttons
  compact?: boolean;
}

export function BookingSidebar({
  bookedSeats,
  onDeleteBooking,
  onToggleReceived,
  onDeleteAll,
  compact = false,
}: BookingSidebarProps) {
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
        onDeleteBooking(seatToDelete);
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
          fullName(seat).toLowerCase().includes(q) ||
          (seat.table?.name ?? "").toLowerCase().includes(q)
      )
      // by last name, then first name
      .sort((a, b) => {
        const last = (x: Seat) => `${x.user?.lastname ?? ""} ${x.user?.firstname ?? ""}`;
        return last(a).localeCompare(last(b), undefined, { sensitivity: "base" });
      });
  }, [bookedSeats, searchQueries]);

  // On screen: guests who have not arrived yet. Arrived guests only show
  // when searched for (to undo a mistake).
  const visibleBookings = useMemo(
    () => (searchQueries.name.trim() ? filteredBookings : filteredBookings.filter((s) => !s.isReceived)),
    [filteredBookings, searchQueries]
  );
  const searchRef = useRef<HTMLInputElement>(null);
  // Pop-ups: "arrived with more guests?" and "already arrived, undo?"
  const [askMore, setAskMore] = useState(false);
  const [undoSeat, setUndoSeat] = useState<Seat | null>(null);
  const markArrived = (seat: Seat) => {
    if (seat.isReceived) {
      setUndoSeat(seat);
      return;
    }
    onToggleReceived(seat.id, true);
    setAskMore(true);
  };

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
          <h2 className="text-xl font-bold text-gray-800 whitespace-nowrap text-center">Guest Names</h2>
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
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onDeleteAll}
                    className="text-xs"
                  >
                    Delete All
                  </Button>
                </>
              )}
            </div>
          </div>

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
                  {visibleBookings.map((seat) => (
                    <tr
                      key={seat.id}
                      className={`border-b border-gray-100 ${seat.isReceived ? "bg-green-50/70" : ""}`}
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
                        <label
                          htmlFor={`received-${seat.id}`}
                          className="font-medium text-gray-900 cursor-pointer"
                        >
                          {seat.user?.firstname} {seat.user?.lastname}
                        </label>
                        {seat.isReceived && (
                          <span className="ml-2 text-[11px] font-semibold text-green-700">Arrived</span>
                        )}
                      </td>
                      <td className="py-0.5 pr-2 align-middle text-xs text-gray-500 whitespace-nowrap">
                        {seat.table.name}
                      </td>
                      <td className="py-0.5 align-middle">
                        <button
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
                        </button>
                      </td>
                    </tr>
                  ))}
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

        {/* After ticking a guest: did more guests arrive with them? */}
        <Dialog open={askMore} onOpenChange={setAskMore}>
          <DialogContent className="w-[92vw] max-w-sm rounded-2xl p-6">
            <DialogTitle className="text-center text-2xl">Arrived with more guests?</DialogTitle>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                className="h-12 text-lg font-bold bg-green-600 text-white hover:bg-green-700"
                onClick={() => {
                  setAskMore(false);
                  setSearchQueries((p) => ({ ...p, name: "" }));
                  setTimeout(() => searchRef.current?.focus(), 50);
                }}
              >
                Yes
              </Button>
              <Button
                variant="outline"
                className="h-12 text-lg font-bold"
                onClick={() => {
                  setAskMore(false);
                  setSearchQueries((p) => ({ ...p, name: "" }));
                }}
              >
                No
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Ticking someone who already arrived: undo? */}
        <Dialog open={!!undoSeat} onOpenChange={(o) => !o && setUndoSeat(null)}>
          <DialogContent className="w-[92vw] max-w-sm rounded-2xl p-6">
            <DialogTitle className="text-center text-xl">
              {undoSeat?.user?.firstname} {undoSeat?.user?.lastname} already arrived
              {undoSeat?.table?.name ? ` (${undoSeat.table.name})` : ""}
            </DialogTitle>
            <p className="text-center text-sm text-zinc-600">Was this a mistake?</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                variant="destructive"
                className="h-12 text-base font-bold"
                onClick={() => {
                  if (undoSeat) onToggleReceived(undoSeat.id, false);
                  setUndoSeat(null);
                }}
              >
                Undo arrival
              </Button>
              <Button variant="outline" className="h-12 text-base font-bold" onClick={() => setUndoSeat(null)}>
                Keep arrived
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <PasswordVerificationDialog
          open={isDeleteBookingDialogOpen}
          onOpenChange={(open) => {
            setIsDeleteBookingDialogOpen(open);
            if (!open) {
              setDeleteBookingConfirmText("");
              setDeleteBookingPassword("");
              setShowDeleteBookingPassword(false);
              setSeatToDelete(null);
            }
          }}
          simple={true}
          onVerified={handleDeleteBookingConfirm}
          action="delete booking"
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
      filteredBookings,
      visibleBookings,
      askMore,
      undoSeat,
      isDeleteBookingDialogOpen,
      deleteBookingConfirmText,
      deleteBookingPassword,
      showDeleteBookingPassword,
      seatToDelete,
      isExporting,
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