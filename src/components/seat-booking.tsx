"use client";

import { BrandLogo } from "@/components/BrandLogo";
import PasswordVerificationDialog from "@/components/password-verification-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  Check,
  ChevronDown,
  FolderPen,
  Menu,
  PersonStandingIcon,
  RefreshCcw,
  ScanBarcode as ScanQrCode,
  Trash,
  Trash2,
  UserCheck2,
  Settings,
  Grid3x3,
  Map as MapIcon,
  Printer,
  ClipboardCheck,
  ListChecks,
  ListOrdered,
  Wine,
  Martini,
  ChefHat,
  History,
  BarChart3,
  Sparkles,
  Radio,
  Pencil,
  Tv,
  MoreHorizontal,
  FileUp,
  UserPlus,
  Plus,
  Image as ImageIcon,
  PlayCircle,
  GraduationCap,
  Star,
  FileText,
  Maximize,
  QrCode,
  CalendarDays,
  Download,
  MessageSquareWarning,
  Users,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addPending, isOffline, readPending, writePending, type Pending } from "@/lib/offlineQueue";
import { toast } from "sonner";
import { useGuests } from "../hooks/useGuests";
import { useGuestNotes } from "../hooks/useGuestNotes";
import { useSeats } from "../hooks/useSeats";
import type { Person, Seat, TableData } from "../types/booking";
import { AddGuestForm } from "./add-guest-form";
import { GuestAccessBanner } from "./GuestAccessBanner";
import { LiveLinkDialog } from "@/components/LiveLinkDialog";
import { UndoItem, undoLastChange } from "@/components/UndoItem";
import { PracticeBanner, startPractice } from "@/components/PracticeBanner";
import { WelcomeDialog } from "@/components/WelcomeDialog";
import { ReportProblem, openReportProblem } from "@/components/ReportProblem";
import { NetworkWatch } from "@/components/NetworkWatch";
import { ReviewDialog, openReview } from "@/components/ReviewForm";

// Open the arrivals board (TV) of the current event in a new tab
async function openBoard() {
  const w = window.open("about:blank", "_blank");
  const j = await fetch("/api/live-link").then((r) => r.json()).catch(() => null);
  if (j?.success && j.link) {
    const link = String(j.link).replace("/live?", "/board?");
    if (w) w.location.href = link;
    else window.location.href = link;
  } else {
    w?.close();
    toast.error(j?.message ?? "Could not open the arrivals board");
  }
}
import { SetupSteps } from "./SetupSteps";
import { SetupWizard } from "./SetupWizard";
import { useBrand } from "@/lib/useBrand";
import { onSetup, openSetup } from "@/lib/setupEvents";
import { AddTableForm } from "./add-table-form";
import { AssignGuestsDialog } from "./assign-guests-dialog";
import { BookingSidebar } from "./booking-sidebar";
import { BulkTableForm } from "./bulk-table-form";
import { ChangePasswordDialog } from "./change-password-dialog";
import { HelpButton } from "./help-dropdown";
import { ImportGuestsforWeb } from "./import-guests-form";
import Loader from "./loader";
import { PDFExport } from "./pdf-export";
import { PersonSelector } from "./person-selector";
import { EditTableDialog } from "./edit-table-dialog";
import WashupButton from "./washup";
import { FloorMapUploader } from "./FloorMapUploader";
import TableNotes from "./TableNotes";
import { EventSwitcher } from "./EventSwitcher";
import { FloorPlanCanvas } from "./FloorPlanCanvas";

const SeatBooking = () => {
  const {
    seats: serverSeats,
    loading,
    error,
    fetchSeats: refreshSeats,
  } = useSeats();
  // Check-ins saved on this computer while the internet was down: shown as
  // done straight away, and sent as soon as the connection is back
  const [pending, setPending] = useState<Pending[]>([]);
  useEffect(() => setPending(readPending()), []);
  const initialSeats = useMemo(() => {
    if (!pending.length) return serverSeats;
    const p = new Map(pending.map((x) => [x.seatId, x.isReceived]));
    return serverSeats.map((s) => (p.has(s.id) ? { ...s, isReceived: p.get(s.id)! } : s));
  }, [serverSeats, pending]);
  const flushing = useRef(false);
  const flushPending = useCallback(async () => {
    if (flushing.current) return;
    const list = readPending();
    if (!list.length) return;
    flushing.current = true;
    const left: Pending[] = [];
    for (const p of list) {
      try {
        const r = await fetch("/api/update-seat-received", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
        if (!r.ok && r.status >= 500) left.push(p);
      } catch {
        left.push(p);
      }
    }
    writePending(left);
    setPending(left);
    flushing.current = false;
    if (left.length < list.length) {
      toast.success(`Back online: ${list.length - left.length} saved check-in${list.length - left.length === 1 ? "" : "s"} sent`);
      refreshSeats();
    }
  }, [refreshSeats]);
  useEffect(() => {
    flushPending();
    const t = window.setInterval(flushPending, 8000);
    window.addEventListener("online", flushPending);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("online", flushPending);
    };
  }, [flushPending]);
  const [isBulkTableDialogOpen, setBulkTableDialogOpen] = useState(false);
  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [tables, setTables] = useState<TableData[]>([]);
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [isPersonSelectorOpen, setIsPersonSelectorOpen] = useState(false);
  const [bookedSeats, setBookedSeats] = useState<Seat[]>([]);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [personToBook, setPersonToBook] = useState<Person | null>(null);
  const [hoveredSeat, setHoveredSeat] = useState<string | null>(null);
  const pdfExportRef = useRef<{ generatePDF: () => void } | null>(null);
  const router = useRouter();
  const hoverOffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredTable, setHoveredTable] = useState<string | number | null>(
    null
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<string | number | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  // On computers, leave room for the footer (with the logo) so the whole
  // page fits on the screen without scrolling, on any monitor size
  const [footerH, setFooterH] = useState(0);
  useEffect(() => {
    const measure = () => {
      const f = document.querySelector("footer");
      setFooterH(f && window.innerWidth >= 1024 ? f.getBoundingClientRect().height : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 500);
    return () => {
      window.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, []);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [isAddGuestOpen, setIsAddGuestOpen] = useState(false);
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [totalGuests, setTotalGuests] = useState(0);
  const [showNamesState, setShowNames] = useState(false);
  const showNames = showNamesState;
  // "plan" = tables placed like the real room, "grid" = the old rows of circles
  const [viewMode, setViewMode] = useState<"plan" | "grid">("plan");
  // the step-by-step setup is on: keep the top bar simple
  const [wizardOn, setWizardOn] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem("dashboardView") === "grid") setViewMode("grid");
    } catch {
      /* ignore */
    }
  }, []);
  // A new floor plan picture switches to the floor plan view
  useEffect(() => {
    const show = () => setViewMode("plan");
    window.addEventListener("floor-map-uploaded", show);
    window.addEventListener("seating4u:show-plan", show);
    return () => {
      window.removeEventListener("floor-map-uploaded", show);
      window.removeEventListener("seating4u:show-plan", show);
    };
  }, []);
  const toggleViewMode = () => {
    setViewMode((m) => {
      const next = m === "plan" ? "grid" : "plan";
      try {
        window.localStorage.setItem("dashboardView", next);
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const [isDeleteAllTablesDialogOpen, setIsDeleteAllTablesDialogOpen] =
    useState(false);
  const { data: session } = useSession();
  // check-in only account: hide everything that deletes or changes tables
  const isStaff = (session?.user as { role?: string } | undefined)?.role === "staff";
  // the owner account: sees every menu item and the delete-everything buttons
  const isAdmin = session?.user?.email === "admin";
  // a regular user (not admin, not check-in staff): one simple Setup menu
  const isUser = !isAdmin && !isStaff;
  // one row of the planner's menu: icon, title, one line saying what it does
  const prow = (Icon: typeof Plus, title: string, hint: string, go: string | (() => void), key?: string) => {
    const body = (
      <span className="flex w-full items-start gap-2.5">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-zinc-700" />
        <span className="min-w-0">
          <span className="block font-semibold">{title}</span>
          <span className="block text-xs leading-snug text-zinc-500">{hint}</span>
        </span>
      </span>
    );
    return typeof go === "string" ? (
      <DropdownMenuItem key={key ?? title} asChild className="cursor-pointer py-1.5">
        <Link href={go}>{body}</Link>
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem key={key ?? title} className="cursor-pointer py-1.5" onClick={go}>
        {body}
      </DropdownMenuItem>
    );
  };
  // Setup steps bar: its buttons open screens here
  useEffect(() => onSetup("bulk-tables", () => setBulkTableDialogOpen(true)), []);
  useEffect(() => {
    // drawing tables / the entrance happen on the floor plan view
    const h = (e: Event) => {
      const t = (e as CustomEvent).detail;
      if (t === "draw-tables" || t === "find-tables" || t === "set-entrance") {
        setIsFullScreen(false);
        setViewMode("plan");
      }
    };
    window.addEventListener("seating4u:open", h);
    return () => window.removeEventListener("seating4u:open", h);
  }, []);
  // height of the banner + setup steps above the room, so the room still fits the screen
  const topBarsRef = useRef<HTMLDivElement>(null);
  const [topBarsH, setTopBarsH] = useState(0);
  const setupBarRef = useRef<HTMLDivElement>(null);
  const [setupBarH, setSetupBarH] = useState(0);
  useEffect(() => {
    const el = setupBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSetupBarH(el.offsetHeight);
      // the floor plan sizes itself to the window: tell it to measure again
      setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = topBarsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setTopBarsH(el.offsetHeight);
      setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Nightclub VIP events: table bookings and spending for the floor plan badges
  const brand = useBrand();
  const [vipByTable, setVipByTable] = useState<Record<string, { info: { status?: string; host?: string; minimum?: number; arrived?: number; partySize?: number }; spent: number }>>({});
  useEffect(() => {
    if (brand !== "vip") return;
    const load = () =>
      fetch("/api/vip")
        .then((r) => r.json())
        .then((j) => {
          if (!j?.success) return;
          const m: typeof vipByTable = {};
          for (const t of j.tables) m[t.id] = { info: t.info, spent: t.spent };
          setVipByTable(m);
        })
        .catch(() => undefined);
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 8000);
    return () => clearInterval(t);
  }, [brand]);
  // the open event, so "Scan QR Code" opens the guest page for this event
  const [activeEventIdForLinks, setActiveEventIdForLinks] = useState("");
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((j) => j?.success && setActiveEventIdForLinks(j.activeId))
      .catch(() => undefined);
  }, []);
  // check-in staff go straight to the full-screen check-in view (once per visit;
  // they can still leave it with Esc or the button on the left edge)
  const staffFullScreenDone = useRef(false);
  useEffect(() => {
    if (isStaff && !staffFullScreenDone.current) {
      staffFullScreenDone.current = true;
      setIsFullScreen(true);
    }
  }, [isStaff]);
  const {
    guests: allGuests,
    loading: guestsLoading,
    error: guestsError,
  } = useGuests();
  const [isAssignGuestsDialogOpen, setIsAssignGuestsDialogOpen] =
    useState(false);

const [isEditTableDialogOpen, setIsEditTableDialogOpen] = useState(false);
  const [tableToEdit, setTableToEdit] = useState<{
    id: string | number;
    name: string;
    seats: number;
  } | null>(null);
  const [isTableGuestsDialogOpen, setIsTableGuestsDialogOpen] = useState(false);
const [selectedTableGuests, setSelectedTableGuests] = useState<{
    tableName: string;
    guests: Seat[];
    notes?: string;
  } | null>(null);

  console.log(guestsLoading);
  console.log(guestsError);

  const getTableInfo = () => {
    return tables.map((table) => ({
      id: table.seats[0].tableId,
      name: table.seats[0]?.table?.name || `Table ${table.tableNumber}`, // Use actual table name from database
      seats: table.seats,
    }));
  };

  const handleAssignGuests = async (guestIds: string[], tableId: string) => {
    try {
      const response = await fetch("/api/assign-guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestIds, tableId }),
      });

      const data = await response.json();
      if (data.success) {
        refreshSeats();
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      throw error;
    }
  };
  console.log(error);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  useEffect(() => {
    if (initialSeats.length > 0) {
      const groupedSeats = initialSeats.reduce(
        (acc: { [key: string]: Seat[] }, seat) => {
          if (!acc[seat.table.name]) {
            acc[seat.table.name] = [];
          }
          acc[seat.table.name].push(seat);
          return acc;
        },
        {}
      );

      const formattedTables: TableData[] = Object.entries(groupedSeats)
        .map(([tableName, seats]) => ({
          tableNumber: Number.parseInt(tableName.replace("Table", "")),
          seats: seats.sort((a, b) => a.seat - b.seat),
        }))
        // "Table 2" before "Table 10"; named tables ("Family", "Head Table") sort by name
        .sort((a, b) => (a.seats[0]?.table?.name ?? "").localeCompare(b.seats[0]?.table?.name ?? "", undefined, { numeric: true, sensitivity: "base" }));

      setTables(formattedTables);
      setBookedSeats(initialSeats.filter((seat) => seat.isBooked));
    }
  }, [initialSeats]);

  const handleBulkTableCreation = () => {
    setBulkTableDialogOpen(true);
  };

  const handleBulkTableSuccess = () => {
    refreshSeats();
    toast.success("Tables created successfully");
  };

  // Add fetch function
  const fetchTotalGuests = async () => {
    const response = await fetch("/api/get-total-guests");
    const data = await response.json();
    setTotalGuests(data.data);
  };

  useEffect(() => {
    fetchTotalGuests();
  }, []);

  const handleDeleteAllBookings = async () => {
    try {
      const toastId = toast.loading("Deleting all bookings...");

      const deletePromises = bookedSeats.map((seat) =>
        fetch("/api/delete-booking", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatId: seat.id }),
        })
      );

      const results = await Promise.all(deletePromises);
      const allSuccessful = results.every(async (res) => {
        const data = await res.json();
        return data.success;
      });

      if (allSuccessful) {
        const updatedTables = tables.map((table) => ({
          ...table,
          seats: table.seats.map((seat) => ({
            ...seat,
            isBooked: false,
            userId: null,
            user: null,
          })),
        }));

        setTables(updatedTables);
        setBookedSeats([]);
        setIsDeleteAllDialogOpen(false);

        toast.success("All bookings deleted successfully", { id: toastId });
      } else {
        throw new Error("Some bookings failed to delete");
      }
    } catch (error) {
      toast.error("Failed to delete all bookings", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  };

  useEffect(() => {
    if (initialSeats.length > 0) {
      const groupedSeats = initialSeats.reduce(
        (acc: { [key: string]: Seat[] }, seat) => {
          if (!acc[seat.table.name]) {
            acc[seat.table.name] = [];
          }
          acc[seat.table.name].push(seat);
          return acc;
        },
        {}
      );

      const formattedTables: TableData[] = Object.entries(groupedSeats)
        .map(([tableName, seats]) => ({
          tableNumber: Number.parseInt(tableName.replace("Table", "")),
          seats: seats.sort((a, b) => a.seat - b.seat),
        }))
        // "Table 2" before "Table 10"; named tables ("Family", "Head Table") sort by name
        .sort((a, b) => (a.seats[0]?.table?.name ?? "").localeCompare(b.seats[0]?.table?.name ?? "", undefined, { numeric: true, sensitivity: "base" }));

      setTables(formattedTables);
      setBookedSeats(initialSeats.filter((seat) => seat.isBooked));
    }
  }, [initialSeats]);

  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullScreen) {
        setIsFullScreen(false);
        toast.info("Exited full-screen mode");
      }
    };

    document.addEventListener("keydown", handleEscKey);

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [isFullScreen]);

  const getVisibleTables = () => {
    return tables;
  };

  const handleSeatClick = (seat: Seat) => {
    if (!seat.isBooked) {
      setSelectedSeat(seat);
      setIsPersonSelectorOpen(true);
    }
  };

  const handlePersonSelect = (person: Person) => {
    if (selectedSeat) {
      setPersonToBook(person);
      setIsConfirmationOpen(true);
      setIsPersonSelectorOpen(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (selectedSeat && personToBook) {
      setIsConfirmationOpen(false);

      try {
        const toastId = toast.loading("Booking seat...");

        const response = await fetch("/api/update-seat", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            seatId: selectedSeat.id,
            userId: personToBook.id,
          }),
        });

        const result = await response.json();

        if (result.success) {
          const updatedTables = tables.map((table) => ({
            ...table,
            seats: table.seats.map((seat) =>
              seat.id === selectedSeat.id
                ? {
                    ...seat,
                    isBooked: true,
                    userId: personToBook.id,
                    user: {
                      id: personToBook.id,
                      firstname: personToBook.firstName,
                      lastname: personToBook.lastName,
                      seat: [],
                    },
                  }
                : seat
            ),
          }));

          setTables(updatedTables);
          setBookedSeats([
            ...bookedSeats,
            {
              ...selectedSeat,
              isBooked: true,
              userId: personToBook.id,
              user: {
                id: personToBook.id,
                firstname: personToBook.firstName,
                lastname: personToBook.lastName,
                seat: [],
              },
            },
          ]);

          toast.success(
            <div className="flex flex-col gap-1">
              <div className="font-semibold">Booking Confirmed! ✨</div>
              <div className="text-sm opacity-90">
                {personToBook.firstName} {personToBook.lastName} is assigned to
                Table {selectedSeat.table.name}, Seat {selectedSeat.seat}
              </div>
            </div>,
            { id: toastId, duration: 4000 }
          );
        } else {
          toast.error("Booking failed", {
            id: toastId,
            description: result.message || "Unable to book the seat",
          });
        }
      } catch (error) {
        toast.error("Booking failed", {
          description: `An unexpected error occurred ${error}`,
        });
      } finally {
        setSelectedSeat(null);
        setPersonToBook(null);
      }
    }
  };

  // guestId: also delete the guest from the list (dropped on the red bin)
  const handleDeleteBooking = async (seatId: string, guestId?: string) => {
    try {
      const toastId = toast.loading("Deleting booking...");

      const response = await fetch("/api/delete-booking", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seatId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const updatedTables = tables.map((table) => ({
          ...table,
          seats: table.seats.map((seat) =>
            seat.id === seatId
              ? {
                  ...seat,
                  isBooked: false,
                  userId: null,
                  user: null,
                }
              : seat
          ),
        }));

        setTables(updatedTables);
        setBookedSeats(bookedSeats.filter((seat) => seat.id !== seatId));
        if (guestId) {
          const g = await fetch("/api/delete-guest", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guestId }),
          })
            .then((r) => r.json())
            .catch(() => null);
          if (g?.success) {
            toast.success("Guest deleted from the list", { id: toastId });
            return;
          }
          toast.error("The seat was freed, but the guest is still on the list", { id: toastId, description: g?.message });
          return;
        }

        toast.success(
          <div className="flex flex-col gap-1">
            <div className="font-semibold">Booking Deleted</div>
            <div className="text-sm opacity-90">
              The seat has been successfully freed up
            </div>
          </div>,
          { id: toastId }
        );
      } else {
        throw new Error(result.message || "Failed to delete the booking.");
      }
    } catch (error) {
      toast.error("Delete Failed", {
        description: `An unexpected error occurred while deleting the booking ${error}`,
      });
    }
  };

  const getTableColor = (index: number) => {
    const colors = [
      "bg-red-100 text-red-700 border-red-300",
      "bg-blue-100 text-blue-700 border-blue-300",
      "bg-green-100 text-green-700 border-green-300",
      "bg-yellow-100 text-yellow-700 border-yellow-300",
      "bg-lime-100 text-lime-700 border-lime-300",
      "bg-pink-100 text-pink-700 border-pink-300",
      "bg-indigo-100 text-indigo-700 border-indigo-300",
      "bg-teal-100 text-teal-700 border-teal-300",
    ];
    return colors[index % colors.length];
  };

  const handleDeleteTable = async (tableId: string | number) => {
    // its number, to offer moving the next tables down ("Table 7" becomes 6...)
    const goneName =
      tables.find((t) => (t.seats[0]?.table?.id || t.tableNumber) === tableId)?.seats[0]?.table?.name ?? "";
    const goneNum = goneName.match(/^\s*(?:table\s*#?\s*)?(\d+)\s*$/i)?.[1];
    const higher = goneNum
      ? tables.filter((t) => {
          const n = (t.seats[0]?.table?.name ?? "").match(/^\s*(?:table\s*#?\s*)?(\d+)\s*$/i)?.[1];
          return n && Number(n) > Number(goneNum);
        }).length
      : 0;
    try {
      const response = await fetch(`/api/delete-table`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tableId }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Table deleted successfully");
        if (
          goneNum &&
          higher > 0 &&
          window.confirm(
            `${goneName} is deleted. Renumber the tables after it?\n\nTable ${Number(goneNum) + 1} becomes ${goneNum}, Table ${Number(goneNum) + 2} becomes ${Number(goneNum) + 1}, and so on (${higher} table${higher === 1 ? "" : "s"}). Guests stay at their table.`
          )
        ) {
          const r = await fetch("/api/tables/renumber", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ after: Number(goneNum) }),
          })
            .then((x) => x.json())
            .catch(() => null);
          if (r?.success) {
            // the numbers printed on the floor plan picture stay as they are
            if (r.changed > 0) (window as unknown as { __skipPictureStamp?: boolean }).__skipPictureStamp = true;
            toast.success(`${r.changed} table${r.changed === 1 ? "" : "s"} renumbered (the floor plan picture is not changed)`);
            refreshSeats();
          }
          else toast.error("Could not renumber the tables");
        }
        // take the deleted table off the screen right away
        setTables(
          tables.filter(
            (t) => (t.seats[0]?.table?.id || t.tableNumber) !== tableId
          )
        );
        setBookedSeats(bookedSeats.filter((seat) => seat.tableId !== tableId));
        refreshSeats();
        router.refresh();
        setIsDeleteDialogOpen(false);
      } else {
        throw new Error(result.message || "Failed to delete table");
      }
    } catch (error) {
      toast.error("Failed to delete table", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  };

const renderCircularTable = (
    table: TableData,
    index: number,
    inFloorPlan = false,
    hideSeats = false,
    // names next to the seats: undefined = follow the "Guest names" button
    namesOverride?: boolean
  ) => {
    const showNames = namesOverride ?? showNamesState;
    const tableId = table.seats[0]?.table?.id || table.tableNumber;
    const tableName = table.seats[0]?.table?.name;
    const tableNumber = table.tableNumber;
    const displayName = tableName || `Table ${tableNumber}`;
    // "Table 12" or "12": shown big on the floor plan as just the number
    const shortName = displayName.replace(/^\s*table\s*#?\s*(?=\S)/i, "").length <= 3;
    const tableColor = getTableColor(index);
    // every guest at this table is VIP: the table gets a gold VIP badge
    const bookedHere = table.seats.filter((s) => s.isBooked && s.user);
    const vipTable = bookedHere.length > 0 && bookedHere.every((s) => s.user?.vip);
    const isHovered = hoveredTable === tableId;
    // round / square / rectangle (the floor plan view draws the table's outline)
    const shape = inFloorPlan ? table.seats[0]?.table?.shape ?? "round" : "round";
    const isRect = shape === "rectangle";
    // Rectangle width ÷ height (from the picture when known)
    // (below 1 = a tall table, standing up)
    const rawRatio = Number(table.seats[0]?.table?.ratio) || 2;
    const ratio = !isRect
      ? 1
      : rawRatio >= 1
      ? Math.min(6, Math.max(1.2, rawRatio))
      : Math.max(1 / 6, Math.min(1 / 1.2, rawRatio));
    // Where seat number i goes, in % of the table area (centre is 45%, like before)
    const seatSpot = (i: number, count: number, extra = 0) => {
      if (shape === "round") {
        const angle = ((i - 2.5) * 2 * Math.PI) / count;
        return {
          left: 45 + Math.cos(angle) * (45 + extra),
          top: 45 + Math.sin(angle) * (45 + extra),
        };
      }
      // Walk around a box, starting top-left, clockwise
      // The table top spans 12%–78% both ways; seats sit the same real
      // distance outside every edge, however long the table is.
      // Real sizes: the box is `ratio` wide and 1 tall (works for wide and tall tables)
      const Wr = ratio;
      const Hr = 1;
      const off = ((12 + extra) / 100) * Math.min(Wr, Hr);
      const x0 = 12 - (off / Wr) * 100;
      const x1 = 78 + (off / Wr) * 100;
      const y0 = 12 - (off / Hr) * 100;
      const y1 = 78 + (off / Hr) * 100;
      const w = x1 - x0;
      const h = y1 - y0;
      const realW = (w / 100) * Wr;
      const realH = (h / 100) * Hr;
      const perim = 2 * (realW + realH);
      let d = ((i + 0.5) / count) * perim;
      if (d < realW) return { left: x0 + (d / realW) * w, top: y0 };
      d -= realW;
      if (d < realH) return { left: x1, top: y0 + (d / realH) * h };
      d -= realH;
      if (d < realW) return { left: x1 - (d / realW) * w, top: y1 };
      d -= realW;
      return { left: x0, top: y1 - (d / realH) * h };
    };

const handleTableClick = () => {
      const bookedGuests = table.seats.filter(seat => seat.isBooked);
      setSelectedTableGuests({
        tableName: displayName,
        guests: bookedGuests,
        notes: table.seats[0]?.table?.notes
      });
      setIsTableGuestsDialogOpen(true);
    };

    return (
      <motion.div
        key={tableId}
        style={{
          ...(isRect ? { aspectRatio: String(ratio) } : {}),
          // On the floor plan, text sizes follow the table's size
          ...(inFloorPlan ? { containerType: "inline-size" as const } : {}),
        }}
        className={`relative w-full mx-auto ${
          isRect ? "" : "aspect-square"
        } ${
          inFloorPlan ? "" : isFullScreen ? "max-w-[500px]" : "max-w-[300px]"
        } ${showNames && !inFloorPlan ? "p-8" : ""}`} // Add padding when names are shown
        onMouseEnter={() => {
          if (hoverOffTimer.current) clearTimeout(hoverOffTimer.current);
          setHoveredTable(tableId);
        }}
        // a short grace period, so the ⚙️ / 🗑️ buttons can still be reached
        onMouseLeave={() => {
          if (hoverOffTimer.current) clearTimeout(hoverOffTimer.current);
          hoverOffTimer.current = setTimeout(() => setHoveredTable((h) => (h === tableId ? null : h)), 700);
        }}
        layout={!inFloorPlan}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.5 }}
      >
        {inFloorPlan && (
          <div
            className={`absolute border-2 border-zinc-300 bg-white/70 pointer-events-none ${
              shape === "round" ? "rounded-full" : "rounded-md"
            }`}
            style={
              hideSeats
                ? { left: "5%", top: "5%", width: "80%", height: "80%" }
                : { left: "12%", top: "12%", width: "66%", height: "66%" }
            }
          />
        )}
        {inFloorPlan && vipTable && (
          <div
            className="absolute z-30 -translate-x-1/2 rounded-full border-2 border-amber-300 bg-amber-400 px-1.5 font-extrabold uppercase leading-tight text-amber-950 shadow pointer-events-none"
            style={{ left: "45%", top: "-4%", fontSize: "clamp(8px, 11cqw, 16px)" }}
            title="VIP table"
          >
            ★ VIP
          </div>
        )}
        {/* Center Table Label */}
        <div
          className={`absolute items-center flex flex-col ${inFloorPlan && !shortName ? "z-30" : "z-10"} transform -translate-x-1/2 -translate-y-1/2 ${
            inFloorPlan ? "gap-0.5" : "gap-2 top-1/2 left-1/2"
          }`}
          // On the floor plan the name stays inside the tabletop, clear of the seats
          style={
            inFloorPlan
              ? {
                  left: "45%",
                  top: "45%",
                  // a short name (a number) may be as wide as it needs; a longer
                  // name may go over the seats so it stays big enough to read
                  maxWidth: shortName ? "none" : "120%",
                  width: shortName ? undefined : "max-content",
                }
              : undefined
          }
        >
          <div
            className={`relative ${
              inFloorPlan && !shortName
                ? // a name (not a number): dark bold letters on a white label, easy to read
                  "bg-white text-zinc-900 ring-1 ring-zinc-400 shadow-md rounded-md"
                : `${tableColor} rounded-full`
            } transition-all duration-200 ease-in-out cursor-pointer hover:shadow-lg ${
              inFloorPlan ? (shortName ? "px-1.5 py-0 max-w-full" : "px-1.5 py-0.5 max-w-full") : "px-4 py-2 mt-5 ml-5"
            }`}
            onClick={handleTableClick}
          >
            <span className="flex items-center justify-center">
              <span
                className={`${inFloorPlan && !shortName ? "font-extrabold tracking-tight" : "font-semibold"} text-center ${
                  inFloorPlan
                    ? `block ${shortName ? "leading-tight whitespace-nowrap" : "leading-none whitespace-normal break-normal [word-break:keep-all] max-w-full"}`
                    : "text-lg"
                }`}
                title={displayName}
                style={
                  inFloorPlan
                    ? {
                        // short names (just a number) get a much bigger font
                        fontSize:
                          shortName
                            ? `var(--table-num, ${isRect ? "clamp(14px, 12cqw, 56px)" : "clamp(14px, 24cqw, 64px)"})`
                            : fitNameFont(
                                displayName.replace(/^\s*table\s*#?\s*(?=\S)/i, "") || displayName,
                                120,
                                isRect,
                              ),
                      }
                    : undefined
                }
              >
                {/* On the floor plan "Table 12" is shown as just "12" so it fits;
                    a longer name with spaces goes on two balanced lines */}
                {inFloorPlan
                  ? nameLines(displayName.replace(/^\s*table\s*#?\s*(?=\S)/i, "") || displayName).map((line, i) => (
                      <span key={i} className="block whitespace-nowrap">{line}</span>
                    ))
                  : displayName}
              </span>
            </span>

            {/* Action Buttons - Shows on Hover */}
            {isHovered && !isFullScreen && !isStaff && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                // On the floor plan the buttons sit ABOVE the name so it stays readable
                className={
                  inFloorPlan
                    ? "absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex gap-1"
                    : "absolute -top-2 -right-2 flex gap-1"
                }
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-full w-8 h-8 p-0 bg-blue-500 hover:bg-blue-600 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          const actualTableId =
                            table.seats[0]?.table?.id || tableId;
                          setTableToEdit({
                            id: actualTableId,
                            name: displayName,
                            seats: table.seats.length,
                          });
                          setIsEditTableDialogOpen(true);
                        }}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit {displayName}</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Existing Delete Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="rounded-full w-8 h-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTableToDelete(tableId);
                          setIsDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete {displayName}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </motion.div>
            )}
          </div>
          {/* Nightclub VIP: open / booked / minimum reached, and what was spent */}
          {inFloorPlan && brand === "vip" && (() => {
            const v = vipByTable[String(table.seats[0]?.table?.id ?? "")];
            if (!v) return null;
            const booked = v.info.status === "booked";
            const min = v.info.minimum ?? 0;
            const reached = min > 0 && v.spent >= min;
            return (
              <span
                // minimum spend: red under half, yellow past half, green when reached
                className={`keep-ink pointer-events-none whitespace-nowrap rounded-full px-1.5 font-bold leading-tight tabular-nums ${
                  !booked
                    ? "bg-zinc-100 text-zinc-600"
                    : !min || reached
                    ? "bg-green-200 text-green-900"
                    : v.spent >= min / 2
                    ? "bg-yellow-200 text-yellow-900"
                    : "bg-red-200 text-red-900"
                }`}
                style={{ fontSize: "clamp(8px, 10cqw, 14px)" }}
                title={booked ? `${v.info.host} · ${v.info.arrived ?? 0}/${v.info.partySize ?? 0} in · $${v.spent} of $${min}` : "Open"}
                data-testid="vip-badge"
              >
                {!booked ? (min ? `OPEN $${min}` : "OPEN") : min ? `$${Math.round(v.spent)}/$${min}` : `$${Math.round(v.spent)}`}
              </span>
            );
          })()}
          {/* on the floor plan, a small count of guests seated / seats (when seats are hidden) */}
          {inFloorPlan && hideSeats && brand !== "vip" && table.seats.length > 0 && (() => {
            const seated = table.seats.filter((st) => st.isBooked).length;
            const full = seated >= table.seats.length;
            return (
              <span
                className={`pointer-events-none rounded-full px-1 font-bold leading-tight tabular-nums ${
                  full ? "bg-red-100 text-red-800" : seated ? "bg-amber-50 text-amber-800" : "bg-zinc-100 text-zinc-500"
                }`}
                style={{ fontSize: "clamp(8px, 10cqw, 14px)" }}
                title={`${seated} guest${seated === 1 ? "" : "s"} seated, ${table.seats.length} seats`}
                data-testid="table-count"
              >
                {seated}/{table.seats.length}
              </span>
            );
          })()}
          {!inFloorPlan && (
            <TableNotes
              tableId={String(table.seats[0]?.table?.id || tableId)}
              initialNotes={table.seats[0]?.table?.notes}
            />
          )}
        </div>
        {/* On the floor plan, the note button sits in the table's corner */}
        {inFloorPlan && isHovered && !isFullScreen && (
          <div className="absolute z-20 scale-75 origin-top-right" style={{ right: "-2%", top: "-2%" }}>
            <TableNotes
              tableId={String(table.seats[0]?.table?.id || tableId)}
              initialNotes={table.seats[0]?.table?.notes}
            />
          </div>
        )}

        {/* Circular Seats (hidden on the floor plan unless "Show seats" is on) */}
        {!hideSeats && table.seats.map((seat, seatIndex) => {
          const countofseats = table.seats.length;
          const { left, top } = seatSpot(seatIndex, countofseats);
          // seat width in % of the table's width
          const seatW = isRect ? (Math.min(0.08 * Math.max(ratio, 1), 0.28 * Math.min(ratio, 1)) / ratio) * 100 : isFullScreen && !inFloorPlan ? 20 : 15;
          const nameSpot = seatSpot(seatIndex, countofseats, 12);

          return (
            <motion.div
              key={seat.id}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: seatIndex * 0.05 }}
              className={`absolute ${
                isRect ? "" : isFullScreen && !inFloorPlan ? "w-[20%]" : "w-[15%]"
              } aspect-square`}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                // centre the seat on its spot (x/y so the pop-in animation keeps it)
                x: "-50%",
                y: "-50%",
                // on a rectangle, seats are about 15% of the table's height
                ...(isRect ? { width: `${seatW}%` } : {}),
              }}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      onClick={() => handleSeatClick(seat)}
                      className={`
                        w-full h-full rounded-full cursor-pointer
                        flex items-center justify-center
                        transition-all duration-200
                        ${
                          seat.isBooked
                            ? "cursor-pointer " +
                              (seat.isReceived
                                ? // arrived: solid dark green with a white check, easy to tell apart
                                  "bg-green-600 border-green-700 text-white shadow-sm"
                                : "bg-red-200 border-red-300 text-red-600")
                            : hoveredSeat === seat.id
                            ? `${tableColor} cursor-pointer`
                            : // empty: plain white with a grey number
                              "bg-white border-zinc-300 text-zinc-500 cursor-pointer"
                        }
                        border-2
                      `}
                      onMouseEnter={() => setHoveredSeat(seat.id)}
                      onMouseLeave={() => setHoveredSeat(null)}
                    >
                      {seat.isBooked ? (
                        seat.isReceived ? (
                          <Check className="h-[70%] w-[70%] text-white" strokeWidth={3.5} aria-label="Arrived" />
                        ) : (
                          <span className="block h-[45%] w-[45%] rounded-full bg-red-500" aria-label="Assigned, not arrived yet" />
                        )
                      ) : (
                        <span
                          className={`font-medium ${
                            inFloorPlan ? "" : isFullScreen ? "text-sm text-lg" : "text-sm"
                          }`}
                          style={
                            inFloorPlan
                              ? { fontSize: isRect ? "clamp(7px, 3.6cqw, 16px)" : "clamp(7px, 7cqw, 16px)" }
                              : undefined
                          }
                        >
                          {seat.seat}
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {seat.isBooked ? (
                      <div className="text-center">
                        <p className="font-semibold">
                          Booked for {seat.user?.firstname}{" "}
                          {seat.user?.lastname}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {seat.table.name}, Seat {seat.seat}
                        </p>
                        <p className="text-xs font-medium">
                          Status: {seat.isReceived ? "Arrived" : "Not Arrived"}
                        </p>
                        {/* <p className="text-xs text-muted-foreground mt-1">
                          Click to {seat.isReceived ? "mark as not arrived" : "mark as arrived"}
                        </p> */}
                      </div>
                    ) : (
                      <p>Click to book this seat</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {showNames && seat.isBooked && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute whitespace-nowrap pointer-events-none z-20"
                  style={
                    inFloorPlan
                      ? {
                          // just outside this seat, pointing away from the table
                          left: `${50 + ((nameSpot.left - left) / seatW) * 100}%`,
                          top: `${50 + ((nameSpot.top - top) / (seatW * ratio)) * 100}%`,
                          x: "-50%",
                          y: "-50%",
                        }
                      : {
                          // Calculate position further out from the seat position
                          left: `${nameSpot.left}%`,
                          top: `${nameSpot.top}%`,
                          x: "-50%",
                          y: "-50%",
                        }
                  }
                >
                  <span
                    className={`font-medium text-zinc-700 bg-white/90 px-1.5 py-0.5 rounded shadow-sm block ${
                      inFloorPlan ? "" : "text-[0.60rem]"
                    }`}
                    style={inFloorPlan ? { fontSize: isRect ? "clamp(8px, 3.5cqw, 16px)" : "clamp(8px, 6cqw, 16px)" } : undefined}
                  >
                    {seat.user?.firstname} {seat.user?.lastname}
                  </span>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    );
  };

  const handleFullScreenToggle = (checked: boolean) => {
    setIsFullScreen(checked);
    if (checked) {
      toast.info("Press Esc to exit full-screen mode");
    }
  };
  // the step-by-step setup finished: open the check-in screen
  useEffect(() => {
    const h = () => {
      setViewMode("plan");
      setIsFullScreen(true);
    };
    window.addEventListener("seating4u:checkin-screen", h);
    return () => window.removeEventListener("seating4u:checkin-screen", h);
  }, []);

  const handleChangePassword = async () => {
    try {
      const response = await fetch("/api/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPassword }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Password changed successfully");
        setIsChangePasswordOpen(false);
      } else {
        toast.error("Failed to change password");
      }
    } catch (error) {
      toast.error(`An error occurred while changing the password ${error}`);
    }
  };

  // Guests with a note: the desk sees the note and decides (Yes / No)
  const { notes, saveAnswer } = useGuestNotes();
  const [holdAsk, setHoldAsk] = useState<{ seatId: string; userId: string; name: string; table: string; note: string } | null>(null);
  // the desk must write how it was settled before giving the seat
  const [deskAnswer, setDeskAnswer] = useState("");
  const [savingAnswer, setSavingAnswer] = useState(false);
  useEffect(() => {
    if (holdAsk) setDeskAnswer("");
  }, [holdAsk]);
  const noteOfSeat = (seatId: string) => {
    const seat =
      bookedSeats.find((s) => s.id === seatId) ??
      tables.flatMap((t) => t.seats).find((s) => s.id === seatId);
    const uid = seat?.user?.id;
    if (!seat || !uid || !notes[uid]) return null;
    return {
      seatId,
      userId: uid,
      name: `${seat.user?.firstname ?? ""} ${seat.user?.lastname ?? ""}`.trim(),
      table: seat.table?.name ?? "",
      note: notes[uid],
    };
  };

  // A whole table (or group) arrives at once
  const handleArriveMany = async (allSeatIds: string[]) => {
    // guests with a note are checked in one by one (the desk reads the note first)
    const held = allSeatIds.map(noteOfSeat).filter(Boolean) as { name: string }[];
    const seatIds = allSeatIds.filter((id) => !noteOfSeat(id));
    if (held.length)
      toast.warning(`${held.map((h) => h.name).join(", ")} ${held.length === 1 ? "has" : "have"} a note`, {
        description: "Tick them one by one to read the note first.",
      });
    if (!seatIds.length) return;
    try {
      const response = await fetch("/api/update-seat-received", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatIds, isReceived: true }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed");
      const ids = new Set(seatIds);
      setTables((prev) =>
        prev.map((table) => ({
          ...table,
          seats: table.seats.map((seat) => (ids.has(seat.id) ? { ...seat, isReceived: true } : seat)),
        }))
      );
      setBookedSeats((prev) => prev.map((seat) => (ids.has(seat.id) ? { ...seat, isReceived: true } : seat)));
      toast.success(`${seatIds.length} guest${seatIds.length === 1 ? "" : "s"} checked in`);
    } catch (error) {
      if (isOffline(error)) {
        const at = new Date().toISOString();
        setPending(addPending(seatIds.map((id) => ({ seatId: id, isReceived: true, at }))));
        const ids = new Set(seatIds);
        setTables((prev) =>
          prev.map((table) => ({
            ...table,
            seats: table.seats.map((seat) => (ids.has(seat.id) ? { ...seat, isReceived: true } : seat)),
          }))
        );
        setBookedSeats((prev) => prev.map((seat) => (ids.has(seat.id) ? { ...seat, isReceived: true } : seat)));
        toast.warning("No internet: saved on this computer", {
          description: "It will be sent automatically when the connection is back.",
        });
        return;
      }
      toast.error("Could not check in the table", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  // Ticking a guest in: if they have a note, ask first
  const handleToggleReceived = async (seatId: string, isReceived: boolean) => {
    if (isReceived) {
      const ask = noteOfSeat(seatId);
      if (ask) {
        setHoldAsk(ask);
        return;
      }
    }
    return checkInSeat(seatId, isReceived);
  };

  const checkInSeat = async (seatId: string, isReceived: boolean) => {
    try {
      const response = await fetch("/api/update-seat-received", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seatId,
          isReceived,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // the guest, plus their party (+1, children) if they have one
        const ids = new Set<string>([seatId, ...((result.partySeatIds as string[] | undefined) ?? [])]);
        // functional updates: two quick ticks never undo each other
        setTables((prev) =>
          prev.map((table) => ({
            ...table,
            seats: table.seats.map((seat) =>
              ids.has(seat.id) ? { ...seat, isReceived } : seat
            ),
          }))
        );
        setBookedSeats((prev) =>
          prev.map((seat) =>
            ids.has(seat.id) ? { ...seat, isReceived } : seat
          )
        );
        if (ids.size > 1 && isReceived) toast.success(`With their party: ${ids.size} people checked in`);

        toast.success(
          `Seat ${isReceived ? "marked as arrived" : "unmarked as arrived"}`
        );
      } else {
        throw new Error(
          result.message || "Failed to update seat arrived status"
        );
      }
    } catch (error) {
      if (isOffline(error)) {
        setPending(addPending([{ seatId, isReceived, at: new Date().toISOString() }]));
        setTables((prev) =>
          prev.map((table) => ({
            ...table,
            seats: table.seats.map((seat) => (seat.id === seatId ? { ...seat, isReceived } : seat)),
          }))
        );
        setBookedSeats((prev) => prev.map((seat) => (seat.id === seatId ? { ...seat, isReceived } : seat)));
        toast.warning("No internet: saved on this computer", {
          description: "It will be sent automatically when the connection is back.",
        });
        return;
      }
      toast.error("Failed to update seat arrived status", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  };

  const handleDeleteAllTables = async () => {
    try {
      const toastId = toast.loading("Deleting all tables...");

      const response = await fetch("/api/delete-all-tables", {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        setTables([]);
        setBookedSeats([]);
        setIsDeleteAllTablesDialogOpen(false);
        toast.success("All tables deleted", { id: toastId, duration: 15000, action: { label: "Undo", onClick: () => undoLastChange() } });
      } else {
        throw new Error(result.message || "Failed to delete all tables");
      }
    } catch (error) {
      toast.error("Failed to delete all tables", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  };

  if (loading) {
    return <Loader />;
  }

  return (
    <div className={`page-bg bg-zinc-100 ${isFullScreen ? "overflow-hidden" : ""}`}>
      <div ref={topBarsRef}>
        {!isFullScreen && !isStaff && <PracticeBanner />}
        {!isFullScreen && !isStaff && <GuestAccessBanner />}
      </div>
      <AnimatePresence>
        {!isFullScreen && (
          <motion.nav
            initial={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            transition={{ duration: 0.5 }}
            className="z-50 bg-white/80 backdrop-blur border-b border-zinc-200 px-2 sm:px-4"
          >
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-0 sm:justify-between h-auto min-h-14 py-2">
              {/* Logo, then the open event (click to switch / start a new one) */}
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="flex justify-center items-center space-x-2"
                >
                  <BrandLogo width={240} style={{ height: "auto", maxHeight: 74 }} />
                </Link>
                <EventSwitcher />
              </div>

              {/* Right Section - Now with better mobile layout */}
              <div className="flex flex-wrap justify-center sm:justify-end items-center gap-2 sm:gap-4">
                {/* Primary Actions Group */}
                <div className={`flex items-center gap-2 ${wizardOn ? "hidden" : ""}`}>
                  <Button
                    onClick={refreshSeats}
                    size="icon"
                    variant="outline"
                    className="w-8 h-8 sm:w-9 sm:h-9"
                  >
                    <RefreshCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          className={`w-8 h-8 sm:w-10 sm:h-10 ${
                            showNames
                              ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                              : ""
                          }`}
                          onClick={() => setShowNames(!showNames)}
                        >
                          <FolderPen className="w-4 h-4 sm:w-5 sm:h-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {showNames ? "Hide booked names" : "Show booked names"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-8 sm:h-9 ${wizardOn ? "hidden" : ""}`}
                        onClick={toggleViewMode}
                      >
                        {viewMode === "plan" ? (
                          <>
                            <Grid3x3 className="w-4 h-4 mr-1" /> Grid
                          </>
                        ) : (
                          <>
                            <MapIcon className="w-4 h-4 mr-1" /> Floor plan
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {viewMode === "plan"
                        ? "Show tables in plain rows"
                        : "Show tables where they are in the room"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {!isStaff && (
                  <span className={wizardOn ? "hidden" : "contents"}>
                    <FloorMapUploader />
                  </span>
                )}

                <WashupButton />

                {/* Secondary Actions Group */}
                <div className="flex items-center gap-2">
                  <div className={`hidden items-center space-x-2 ${wizardOn ? "" : "sm:flex"}`}>
                    <span className="text-sm font-medium">Full Screen</span>
                    <Switch
                      checked={isFullScreen}
                      onCheckedChange={handleFullScreenToggle}
                    />
                  </div>

                  <HelpButton />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="outline" className="w-8 h-8 sm:w-9 sm:h-9">
                        <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    {isUser ? (
                    <DropdownMenuContent align="end" className="w-[19rem] max-h-[85vh] overflow-y-auto p-1.5">
                      {/* Regular users: a short menu. The setup itself is the step-by-step; the rest sits in 4 groups. */}
                      {prow(CalendarDays, "My events", "Start a new event, or open another one.", () => window.dispatchEvent(new Event("seating4u:open-events")))}
                      {prow(ListOrdered, "Set up my event, step by step", "One question at a time, with Next.", () => window.dispatchEvent(new Event("seating4u:show-setup")))}
                      {prow(Maximize, "Check-in screen", "On the event day: search a name, tick, done.", () => handleFullScreenToggle(true))}
                      <DropdownMenuSeparator />
                      {[
                        {
                          icon: Printer,
                          title: "Print",
                          hint: "QR code, door list, table signs, chart",
                          items: (
                            <>
                              {prow(QrCode, "Guest QR code (entrance poster)", "Guests scan it to find their seat.", () => window.dispatchEvent(new Event("seating4u:open-qr")))}
                              {prow(ListChecks, "Door list (A–Z)", "Paper backup for the check-in desk.", "/dashboard/door-list")}
                              {prow(Printer, "Table signs & place cards", "Numbers for the tables, names for the plates.", "/dashboard/print-cards")}
                              {prow(MapIcon, "Seating chart for the venue", "Floor plan + guests by table, for staff and caterer.", "/dashboard/venue-chart")}
                            </>
                          ),
                        },
                        {
                          icon: CalendarDays,
                          title: "Event day",
                          hint: "Door staff, live view, TV board, kitchen",
                          items: (
                            <>
                              {prow(ClipboardCheck, "Ready check (the night before)", "Finds anything that could go wrong at the door.", "/dashboard/ready-check")}
                              {prow(Users, "Check-in staff logins", "Add, reset or remove logins for your door helpers.", "/dashboard/check-in-staff")}
                              {prow(Radio, "Live view for your client", "A link: they watch arrivals live. View only.", () => window.dispatchEvent(new Event("seating4u:live-link")))}
                              {prow(Tv, "Arrivals board for a TV", "At the entrance: each guest is welcomed by name and table.", openBoard)}
                              {prow(ChefHat, "Kitchen screen", "Meals to serve as guests arrive, allergies in red.", "/dashboard/kitchen")}
                            </>
                          ),
                        },
                        {
                          icon: BarChart3,
                          title: "After the event",
                          hint: "Summary, report for your client, review",
                          items: (
                            <>
                              {prow(BarChart3, "Arrival summary & close out", "Who came, no-shows, meals served. Closes guest check-in.", "/dashboard/summary")}
                              {prow(FileText, "Report for your client", "A thank-you report they can print.", () => window.dispatchEvent(new Event("seating4u:live-link")))}
                              {prow(Star, "Leave us a review", "How is Seating4U working for you?", openReview)}
                            </>
                          ),
                        },
                        {
                          icon: Pencil,
                          title: "Change guests & tables",
                          hint: "Add one, import more, seat everyone, undo",
                          items: (
                            <>
                              {prow(UserPlus, "Add one guest", "A last-minute guest.", () => setIsAddGuestOpen(true))}
                              {prow(Plus, "Add one table", "One more table in the room.", () => setIsAddTableOpen(true))}
                              {prow(FileUp, "Import more guests (Excel)", "Add or update guests from a file.", () => openSetup("import-guests"))}
                              {prow(Sparkles, "Seat everyone", "One click. Families stay together.", "/dashboard/seating-helper")}
                              {prow(ImageIcon, "Change the floor plan", "Upload a new picture of the room.", () => openSetup("floor-map"))}
                              <UndoItem />
                              {prow(GraduationCap, "Practice with sample guests", "A pretend event to learn. Delete it after.", startPractice)}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="cursor-pointer text-red-600" onClick={() => setIsDeleteAllTablesDialogOpen(true)}>
                                <span className="flex items-start gap-2.5">
                                  <Trash className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span>
                                    <span className="block font-semibold">Start the room over</span>
                                    <span className="block text-xs text-red-500">Deletes all tables (guests stay). You can undo it.</span>
                                  </span>
                                </span>
                              </DropdownMenuItem>
                            </>
                          ),
                        },
                      ].map((g) => (
                        <DropdownMenuSub key={g.title}>
                          <DropdownMenuSubTrigger className="cursor-pointer py-1.5">
                            <span className="flex w-full items-start gap-2.5">
                              <g.icon className="mt-0.5 h-5 w-5 shrink-0 text-zinc-700" />
                              <span className="min-w-0">
                                <span className="block font-semibold">{g.title}</span>
                                <span className="block text-xs leading-snug text-zinc-500">{g.hint}</span>
                              </span>
                            </span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-[19rem] max-h-[85vh] overflow-y-auto p-1.5">{g.items}</DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ))}
                      <DropdownMenuSeparator />
                      {prow(PlayCircle, "Watch how (3 min video)", "Every step shown, with voice.", "/user-guide")}
                      {prow(MessageSquareWarning, "Something wrong? Tell us", "Write what happened. We'll look at it.", openReportProblem)}
                    </DropdownMenuContent>
                    ) : (
                    <DropdownMenuContent align="end" className="w-60">
                      {/* The things used most, then Print and More in sub-menus */}
                      {!isStaff && (
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => window.dispatchEvent(new Event("seating4u:show-setup"))}
                        >
                          <ListOrdered className="mr-2 w-4 h-4" /> Set up my event, step by step
                        </DropdownMenuItem>
                      )}
                      {!isStaff && (
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard/seating-helper">
                            <Sparkles className="mr-2 w-4 h-4" /> Seat everyone
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {!isStaff && (
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => window.dispatchEvent(new Event("seating4u:live-link"))}
                        >
                          <Radio className="mr-2 w-4 h-4" /> Client live view (share link)
                        </DropdownMenuItem>
                      )}
                      {!isStaff && (
                        <DropdownMenuItem className="cursor-pointer" onClick={openBoard}>
                          <Tv className="mr-2 w-4 h-4" /> Arrivals board for a TV
                        </DropdownMenuItem>
                      )}
                      {brand === "vip" && (
                        <>
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard/vip">
                              <Wine className="mr-2 w-4 h-4" /> VIP tables &amp; bottles
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard/bar">
                              <Martini className="mr-2 w-4 h-4" /> Bar screen
                            </Link>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem asChild>
                        <Link href="/dashboard/summary">
                          <BarChart3 className="mr-2 w-4 h-4" /> Arrival summary &amp; close out
                        </Link>
                      </DropdownMenuItem>
                      {!isStaff && <UndoItem />}

                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Printer className="mr-2 w-4 h-4" /> Print
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-60">
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard/venue-chart">
                              <MapIcon className="mr-2 w-4 h-4" /> Seating chart for the venue
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard/door-list">
                              <ListChecks className="mr-2 w-4 h-4" /> Door list (A–Z)
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard/print-cards">
                              <Printer className="mr-2 w-4 h-4" /> Table signs &amp; place cards
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard/seating-chart">
                              <Printer className="mr-2 w-4 h-4" /> Seating chart, report &amp; RSVP links
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <MoreHorizontal className="mr-2 w-4 h-4" /> More
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-60">
                          <DropdownMenuItem className="cursor-pointer" onClick={openReportProblem}>
                            <MessageSquareWarning className="mr-2 w-4 h-4" /> Report a problem
                          </DropdownMenuItem>
                          {session?.user?.email === "admin" && (
                            <DropdownMenuItem asChild>
                              <Link href="/dashboard/planners">
                                <Users className="mr-2 w-4 h-4" /> Planners, requests &amp; reviews
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {session?.user?.email === "admin" && (
                            <DropdownMenuItem asChild>
                              <a href="/api/export-all" download>
                                <Download className="mr-2 w-4 h-4" /> Download all my data (Excel)
                              </a>
                            </DropdownMenuItem>
                          )}
                          {session?.user?.email === "admin" && (
                            <DropdownMenuItem asChild>
                              <Link href="/dashboard/problems">
                                <MessageSquareWarning className="mr-2 w-4 h-4" /> Problems reported
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {!isStaff && (
                            <DropdownMenuItem className="cursor-pointer" onClick={startPractice}>
                              <GraduationCap className="mr-2 w-4 h-4" /> Practice with sample guests
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard/ready-check">
                              <ClipboardCheck className="mr-2 w-4 h-4" /> Ready check
                            </Link>
                          </DropdownMenuItem>
                          {!isStaff && (
                            <DropdownMenuItem onClick={() => setIsAssignGuestsDialogOpen(true)}>
                              <UserCheck2 className="mr-2 w-4 h-4" /> Assign multiple guests
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard/kitchen">
                              <ChefHat className="mr-2 w-4 h-4" /> Kitchen screen
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={activeEventIdForLinks ? `/seat-scanning?event=${activeEventIdForLinks}` : "/seat-scanning"}
                              className="flex items-center"
                            >
                              <ScanQrCode className="mr-2 w-4 h-4" /> Scan QR code
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/scanner" className="flex items-center">
                              <Camera className="mr-2 w-4 h-4" /> Scanner
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/client-view" className="flex items-center">
                              <PersonStandingIcon className="mr-2 w-4 h-4" /> Client view (seats)
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard/history">
                              <History className="mr-2 w-4 h-4" /> History
                            </Link>
                          </DropdownMenuItem>
                          {!isStaff && (
                            <DropdownMenuItem asChild>
                              <Link href="/dashboard/check-in-staff">
                                <Users className="mr-2 w-4 h-4" /> Manage check-in staff
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {session?.user?.email === "admin" && (
                            <DropdownMenuItem asChild>
                              <Link href="/dashboard/manage-users">
                                <Users className="mr-2 w-4 h-4" /> Manage users
                              </Link>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuContent>
                    )}
                  </DropdownMenu>

                  {/* Create New Dropdown (regular users have these in the ☰ menu) */}
                  {!isUser && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-8 sm:h-9 px-2 sm:px-3 text-sm font-semibold">
                        <span>New</span>
                        <ChevronDown className="h-4 w-4 ml-1 sm:ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {!isStaff && (
                        <>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => setIsAddTableOpen(true)}
                          >
                            New Table
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={handleBulkTableCreation}
                          >
                            Bulk Create Tables
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() => setIsAddGuestOpen(true)}
                      >
                        New Guest
                      </DropdownMenuItem>
                      {!isStaff && <ImportGuestsforWeb />}
                      {isAdmin && (
                        <DropdownMenuItem
                          className="cursor-pointer text-red-600"
                          onClick={() => setIsDeleteAllTablesDialogOpen(true)}
                        >
                          <Trash className="w-4 h-4 mr-2" />
                          Delete All Tables
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  )}

                  {/* Avatar Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      {/* who is logged in, and what kind of account (instead of a photo) */}
                      <button
                        type="button"
                        className="flex max-w-[11rem] items-center gap-2 rounded-full border bg-white py-1 pl-1 pr-3 text-left hover:bg-zinc-50"
                        title="Your account"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white sm:h-8 sm:w-8">
                          {(session?.user?.name || session?.user?.email || "?").trim().slice(0, 1).toUpperCase()}
                        </span>
                        <span className="hidden min-w-0 leading-tight sm:block">
                          <span className="block truncate text-[11px] text-zinc-500">Logged in as</span>
                          <span className="block truncate text-sm font-semibold">{session?.user?.name || session?.user?.email}</span>
                          <span className={`block text-[10px] font-semibold uppercase tracking-wide ${isAdmin ? "text-red-600" : isStaff ? "text-amber-600" : "text-lime-700"}`}>
                            {isAdmin ? "Admin" : isStaff ? "Check-in staff" : "Event planner"}
                          </span>
                        </span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="flex flex-col">
                      <ChangePasswordDialog />
                      <Button
                        variant="destructive"
                        onClick={handleSignOut}
                        className="mt-4"
                      >
                        Sign out
                      </Button>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
      <div ref={setupBarRef}>{!isFullScreen && isAdmin && !wizardOn && <SetupSteps />}</div>
      {!isStaff && <SetupWizard onActiveChange={setWizardOn} />}
      {!isStaff && <ImportGuestsforWeb noButton />}
      {!isStaff && <LiveLinkDialog />}
      {isUser && <WelcomeDialog />}
      <ReportProblem />
      <NetworkWatch />
      {isUser && <ReviewDialog />}

      {/* Main Content */}
      <div
        className={`flex flex-col lg:flex-row ${isFullScreen ? "h-screen" : ""}`}
        style={isFullScreen ? undefined : { height: `calc(100vh - 64px - ${footerH + topBarsH + setupBarH}px)` }}
      >
        {/* Main Content - Tables */}
        <motion.div
          layout
          className={`w-full ${
            isFullScreen ? (viewMode === "plan" ? "xl:flex-1 xl:min-w-0" : "") : "lg:w-full xl:w-3/4"
          } page-bg bg-zinc-50 overflow-hidden`}
          transition={{ duration: 0.5 }}
        >
          <AnimatePresence>
            {!isFullScreen && (
              <motion.div
                initial={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: -50,
                }}
                transition={{ duration: 0.5 }}
                className="sticky top-0 z-40 bg-white border-b border-zinc-200 px-4 py-1.5 md:px-5 md:py-2"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="w-full md:w-auto">
                    <div className="flex flex-wrap gap-1.5 md:gap-2">
                      <div className="bg-zinc-50 rounded-md border border-zinc-200 px-2.5 py-1 flex items-baseline gap-1.5 whitespace-nowrap">
                        <div className="text-[10.5px] leading-none uppercase tracking-wider font-medium text-zinc-500">
                          Seats
                        </div>
                        <div className="text-[15px] leading-none font-bold text-zinc-800 tabular-nums">
                          {tables.reduce(
                            (total, table) => total + table.seats.length,
                            0
                          )}
                        </div>
                      </div>
                      <div className="bg-cyan-50 rounded-md border border-cyan-200 px-2.5 py-1 flex items-baseline gap-1.5 whitespace-nowrap">
                        <div className="text-[10.5px] leading-none uppercase tracking-wider font-medium text-cyan-600">
                          Invited
                        </div>
                        <div className="text-[15px] leading-none font-bold text-cyan-800 tabular-nums">
                          {totalGuests}
                        </div>
                      </div>
                      <div className="bg-red-50 rounded-md border border-red-200 px-2.5 py-1 flex items-baseline gap-1.5 whitespace-nowrap">
                        <div className="text-[10.5px] leading-none uppercase tracking-wider font-medium text-red-600">
                          Assigned
                        </div>
                        <div className="text-[15px] leading-none font-bold text-red-800 tabular-nums">
                          {tables.reduce(
                            (booked, table) =>
                              booked +
                              table.seats.filter((seat) => seat.isBooked)
                                .length,
                            0
                          )}
                        </div>
                      </div>
                      <div className="bg-green-50 rounded-md border border-green-200 px-2.5 py-1 flex items-baseline gap-1.5 whitespace-nowrap">
                        <div className="text-[10.5px] leading-none uppercase tracking-wider font-medium text-green-600">
                          Available
                        </div>
                        <div className="text-[15px] leading-none font-bold text-green-800 tabular-nums">
                          {tables.reduce(
                            (available, table) =>
                              available +
                              table.seats.filter((seat) => !seat.isBooked)
                                .length,
                            0
                          )}
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-md border border-blue-200 px-2.5 py-1 flex items-baseline gap-1.5 whitespace-nowrap">
                        <div className="text-[10.5px] leading-none uppercase tracking-wider font-medium text-blue-600">
                          Arrived
                        </div>
                        <div className="text-[15px] leading-none font-bold text-blue-800 tabular-nums">
                          {tables.reduce(
                            (arrived, table) =>
                              arrived +
                              table.seats.filter(
                                (seat) => seat.isBooked && seat.isReceived
                              ).length,
                            0
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="flex items-center space-x-2">
                      {" "}
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-white border-2 border-zinc-300"></div>
                        <span className="text-sm text-zinc-600">Available</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-red-200"></div>
                        <span className="text-sm text-zinc-600">Assigned</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-green-600"></div>
                        <span className="text-sm text-zinc-600">Arrived</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scrollable Table Grid */}
          <ScrollArea
            className={isFullScreen ? "h-screen" : ""}
            style={isFullScreen ? undefined : { height: `calc(100vh - 144px - ${footerH + topBarsH + setupBarH}px)` }}
          >
            {viewMode === "plan" ? (
              <FloorPlanCanvas
                tables={getVisibleTables()}
                renderTable={(table, index, hideSeats, names) =>
                  renderCircularTable(table, index, true, hideSeats, names)
                }
                guestNames={showNames}
                onGuestNamesChange={setShowNames}
                invited={totalGuests}
                onToggleArrived={handleToggleReceived}
                onArriveMany={handleArriveMany}
                staff={isStaff}
                onTablesChanged={refreshSeats}
                roomOnly={isFullScreen}
                onRoomOnlyChange={setIsFullScreen}
              />
            ) : (
            <motion.div
              layout
              className={`py-6 px-8 grid gap-12 sm:pb-[3rem] pb-[9rem]`}
              style={{
                gridTemplateColumns: isFullScreen
                  ? "repeat(4, minmax(0, 1fr))"
                  : "repeat(auto-fill, minmax(250px, 1fr))",
              }}
              transition={{ duration: 0.5 }}
            >
              {getVisibleTables().map((table, index) =>
                renderCircularTable(table, index)
              )}
            </motion.div>
            )}
          </ScrollArea>
        </motion.div>

        <AnimatePresence>
          {(!isFullScreen || viewMode === "plan") && (
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              transition={{ duration: 0.3 }}
              className={`hidden xl:block ${isFullScreen ? "w-fit min-w-[13rem] max-w-xs shrink-0" : "w-1/4 xl:rounded-xl xl:border xl:border-zinc-200 xl:mr-2 xl:shadow-sm"} bg-white overflow-hidden my-2 lg:my-0 lg:ml-2`}
            >
              <BookingSidebar
                bookedSeats={bookedSeats}
                onDeleteBooking={handleDeleteBooking}
                onToggleReceived={handleToggleReceived}
                onCheckInNow={(id) => handleToggleReceived(id, true)}
                onDeleteAll={isAdmin ? () => setIsDeleteAllDialogOpen(true) : undefined}
                compact={isFullScreen || isStaff}
                readOnly={isStaff}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!isFullScreen && (
        <div className="xl:hidden">
          <BookingSidebar
            bookedSeats={bookedSeats}
            onDeleteBooking={handleDeleteBooking}
            onToggleReceived={handleToggleReceived}
            onCheckInNow={(id) => handleToggleReceived(id, true)}
            onDeleteAll={() => setIsDeleteAllDialogOpen(true)}
            compact={isStaff}
            readOnly={isStaff}
          />
          {/* the floor plan puts the Arrived list here on phones */}
          <div id="arrived-under-guests" className="px-2" />
        </div>
      )}

      

      <PersonSelector
        isOpen={isPersonSelectorOpen}
        onClose={() => setIsPersonSelectorOpen(false)}
        onSelect={handlePersonSelect}
      />

      <PDFExport bookedSeats={bookedSeats} ref={pdfExportRef} />

      <Dialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-zinc-800">
              Confirm Booking
            </DialogTitle>
            <DialogDescription className="mt-2">
              <div className="space-y-2">
                <div className="p-4 bg-zinc-50 rounded-lg">
                  <p className="font-medium text-zinc-700">
                    {selectedSeat?.table.name}, Seat {selectedSeat?.seat}
                  </p>
                  <p className="text-zinc-600">
                    {personToBook?.firstName} {personToBook?.lastName}
                  </p>
                </div>
                <p className="text-sm text-zinc-600">
                  Please confirm if you want to proceed with this booking.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsConfirmationOpen(false)}
              className="w-full sm:w-auto hover:bg-red-50 hover:text-red-600"
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmBooking}>Confirm Booking</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddTableForm
        onTableAdded={refreshSeats}
        isOpen={isAddTableOpen}
        onClose={() => setIsAddTableOpen(false)}
        onSuccess={() => {
          router.refresh();
        }}
      />

      {/* Delete Table Dialog */}
      <PasswordVerificationDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
        }}
        onVerified={() => tableToDelete && handleDeleteTable(tableToDelete)}
        action="delete table"
        confirmText="Delete Table"
        confirmTextDisplay="Delete Table"
      />

      <BulkTableForm
        isOpen={isBulkTableDialogOpen}
        onClose={() => setBulkTableDialogOpen(false)}
        onSuccess={handleBulkTableSuccess}
      />

      {/* Offline: check-ins waiting to be sent */}
      {pending.length > 0 && (
        <div className="fixed bottom-3 left-1/2 z-[80] -translate-x-1/2 rounded-full border-2 border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow-lg">
          📶 No internet: {pending.length} check-in{pending.length === 1 ? "" : "s"} saved on this computer. They will be sent
          automatically. Keep checking guests in, and don&apos;t refresh or close this page until the internet is back.
        </div>
      )}

      {/* A guest with a note: read it, then give them their seat or not */}
      <Dialog open={!!holdAsk} onOpenChange={(o) => !o && setHoldAsk(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>📝 Note for {holdAsk?.name}</DialogTitle>
            <DialogDescription>{holdAsk?.table}</DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-lg font-semibold text-amber-950">
            {holdAsk?.note}
          </div>
          {/* required: how it was settled */}
          <div className="space-y-1.5">
            <label htmlFor="desk-answer" className="text-sm font-bold">
              Desk note <span className="font-semibold text-red-600">(required)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {["None"].map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setDeskAnswer(o)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                    deskAnswer === o ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white hover:bg-zinc-50"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
            <Input
              id="desk-answer"
              value={deskAnswer}
              maxLength={200}
              onChange={(e) => setDeskAnswer(e.target.value)}
              placeholder="Write what happened (e.g. paid $250 by Zelle)"
              className={deskAnswer.trim() ? "border-green-400" : "border-red-300"}
            />
          </div>
          <p className="text-base font-medium">Give them their seat and check them in?</p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={() => setHoldAsk(null)}>
              No, not now
            </Button>
            <Button
              className="h-11 flex-1 bg-green-600 hover:bg-green-700"
              disabled={!deskAnswer.trim() || savingAnswer}
              title={deskAnswer.trim() ? "" : "Write the desk note first"}
              onClick={async () => {
                const a = holdAsk;
                if (!a || !deskAnswer.trim()) return;
                setSavingAnswer(true);
                const ok = await saveAnswer(a.userId, deskAnswer.trim());
                setSavingAnswer(false);
                if (!ok) {
                  toast.error("Could not save the desk note. Try again.");
                  return;
                }
                setHoldAsk(null);
                checkInSeat(a.seatId, true);
              }}
            >
              {savingAnswer ? "Saving…" : "Yes, check in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddGuestForm
        isOpen={isAddGuestOpen}
        onClose={() => setIsAddGuestOpen(false)}
        tables={getTableInfo()}
        onSuccess={() => {
          setIsAddGuestOpen(false);
          refreshSeats();
          router.refresh();
        }}
      />

      <AssignGuestsDialog
        isOpen={isAssignGuestsDialogOpen}
        onClose={() => setIsAssignGuestsDialogOpen(false)}
        guests={allGuests || []}
        tables={getTableInfo()}
        onAssignGuests={handleAssignGuests}
      />

      <Dialog
        open={isChangePasswordOpen}
        onOpenChange={setIsChangePasswordOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-zinc-800">
              Change Password
            </DialogTitle>
            <DialogDescription className="mt-2">
              Enter your new password below.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsChangePasswordOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button onClick={handleChangePassword}>Change Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete All Bookings Dialog */}
      <PasswordVerificationDialog
        open={isDeleteAllDialogOpen}
        onOpenChange={setIsDeleteAllDialogOpen}
        onVerified={handleDeleteAllBookings}
        action="delete all bookings"
        confirmText="Delete All Bookings"
        confirmTextDisplay="Delete All Bookings"
      />

      {/* Delete All Tables Dialog */}
      <PasswordVerificationDialog
        open={isDeleteAllTablesDialogOpen}
        onOpenChange={setIsDeleteAllTablesDialogOpen}
        onVerified={handleDeleteAllTables}
        action="delete all tables"
        confirmText="Delete All Tables"
        confirmTextDisplay="Delete All Tables"
      />

      {/* Edit Table Dialog */}
      {tableToEdit && (
        <EditTableDialog
          isOpen={isEditTableDialogOpen}
          onClose={() => {
            setIsEditTableDialogOpen(false);
            setTableToEdit(null);
          }}
          tableId={tableToEdit.id}
          currentName={tableToEdit.name}
          currentSeats={tableToEdit.seats}
          onSuccess={() => {
            refreshSeats();
            setTableToEdit(null);
          }}
        />
      )}

{/* Table Guests Dialog - Shows list of guests assigned to clicked table */}
      <Dialog open={isTableGuestsDialogOpen} onOpenChange={setIsTableGuestsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-zinc-800">
              {selectedTableGuests?.tableName}
            </DialogTitle>
            <DialogDescription className="mt-2 space-y-2">
              {selectedTableGuests?.guests.length === 0 ? (
                <p className="text-zinc-600">No guests assigned to this table yet.</p>
              ) : (
                <p className="text-zinc-600">
                  {selectedTableGuests?.guests.length} guest(s) assigned to this table
                </p>
              )}
              {selectedTableGuests?.notes && (
                <div className="mt-3 p-3 text-center bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-lg font-semibold text-amber-800 mb-1">Table Notes:</p>
                  <p className="text-xl text-amber-900 whitespace-pre-wrap">
                    {selectedTableGuests.notes}
                  </p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          {/* Scrollable list of guests */}
          <ScrollArea className="max-h-[400px] mt-4">
            <div className="space-y-2">
              {selectedTableGuests?.guests.map((seat) => (
                <div
                  key={seat.id}
                  className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                    seat.isReceived 
                      ? "bg-green-50 border-2 border-green-300 shadow-sm" 
                      : "bg-zinc-50 border border-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Seat number badge - green for arrived, red for not arrived */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      seat.isReceived 
                        ? "bg-green-500 text-white shadow-md" 
                        : "bg-red-200 text-red-700"
                    }`}>
                      {seat.seat}
                    </div>
                    {/* Guest information */}
                    <div>
                      <p className={`font-medium ${
                        seat.isReceived ? "text-green-800" : "text-zinc-800"
                      }`}>
                        {seat.user?.firstname} {seat.user?.lastname}
                      </p>
                      <p className={`text-xs ${
                        seat.isReceived ? "text-green-600 font-medium" : "text-zinc-500"
                      }`}>
                        Seat {seat.seat} • {seat.isReceived ? "✓ Arrived" : "Not Arrived"}
                      </p>
                    </div>
                  </div>
                  {/* Check icon for arrived guests */}
                  {seat.isReceived && (
                    <div className="bg-green-500 rounded-full p-1">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter className="mt-4">
            <Button 
              variant="outline" 
              onClick={() => setIsTableGuestsDialogOpen(false)}
              className="w-full"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};


// Font size so a table name (like "JODEL" or "Head Table") fits inside the
// tabletop instead of being cut to "J...". Long names may use two lines.
// "Head Table Family" -> ["Head Table", "Family"]: two lines of about equal
// length, never splitting a word. Short names stay on one line.
function nameLines(name: string): string[] {
  const t = name.trim();
  const words = t.split(/\s+/);
  if (words.length < 2 || t.length <= 8) return [t];
  let best = [t], bestDiff = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(" "), b = words.slice(k).join(" ");
    const diff = Math.max(a.length, b.length);
    if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
  }
  return best;
}

function fitNameFont(name: string, maxWidthPct: number, isRect: boolean) {
  const words = name.trim().split(/\s+/);
  const longestWord = Math.max(...words.map((w) => w.length));
  // two lines for longer names with spaces, never splitting a word
  const perLine = Math.max(longestWord, ...nameLines(name).map((l) => l.length), 1);
  // a bold capital is up to about 0.85 of the font size wide; 12px is the label's padding
  const width = isRect ? maxWidthPct * 0.55 : maxWidthPct;
  const fit = `calc((${width}cqw - 12px) / ${(perLine * 0.85).toFixed(2)})`;
  return `clamp(10px, min(${fit}, ${isRect ? 9 : 17}cqw), 30px)`;
}

export default SeatBooking;
