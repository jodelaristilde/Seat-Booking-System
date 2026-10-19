"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Check, HelpCircle, QrCode, Search, MapPin, Mic, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { matches, matchesAny } from "@/lib/fold";
import { toast } from "sonner";
import { GUEST_TEXT, LANGS, detectLang, type Lang } from "@/lib/guestText";

interface User {
  id: string;
  firstname: string;
  lastname: string;
  eventId?: string | null;
  eventName?: string | null;
  seat: Array<{
    id: string;
    seat: number;
    isReceived?: boolean;
    table: {
      id: string;
      name: string;
    };
  }>;
}

interface FloorMapImage {
  id: string;
  filename: string;
  data: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export default function SeatScanning() {
  // Language (English / Español / Français / Kreyòl), remembered on the phone
  const [lang, setLangRaw] = useState<Lang>("en");
  useEffect(() => setLangRaw(detectLang()), []);
  const setLang = (l: Lang) => {
    setLangRaw(l);
    try {
      localStorage.setItem("seating4u_lang", l);
    } catch {
      /* ignore */
    }
  };
  const t = GUEST_TEXT[lang];
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchResult, setSearchResult] = useState<{
    table: string;
    seat: number;
    name: string;
    seatId: string;
  } | null>(null);
  const [seatIsReceived, setSeatIsReceived] = useState(false);
  const [noSeatFound, setNoSeatFound] = useState(false);
  const [isFloorMapOpen, setIsFloorMapOpen] = useState(false);
  // The way to the guest's table: their table on the plan + the entrance(s)
  const [way, setWay] = useState<Way | null>(null);
  const [floorMapImage, setFloorMapImage] = useState<FloorMapImage | null>(
    null
  );
  const [loadingFloorMap, setLoadingFloorMap] = useState(false);
  const [tableNotes, setTableNotes] = useState<string | null>(null);

  // Checking in a group: after "Arrived", ask if more guests came along
  type Arrived = { seatId: string; name: string; table: string };
  const [askMore, setAskMore] = useState(false);
  const [groupMode, setGroupMode] = useState<null | "adding" | "done">(null);
  const [group, setGroup] = useState<Arrived[]>([]);
  const [groupQuery, setGroupQuery] = useState("");
  const [groupResults, setGroupResults] = useState<User[]>([]);
  const [groupBusy, setGroupBusy] = useState<string | null>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = groupQuery.trim();
    if (q.length < 2) {
      setGroupResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/find-guest?q=${encodeURIComponent(q)}${eventId ? `&event=${encodeURIComponent(eventId)}` : ""}`
        );
        const data = await response.json();
        if (!cancelled && data.success) setGroupResults(data.data);
      } catch (error) {
        console.error("Error searching guests:", error);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [groupQuery]);

  const tableNumber = (t: string) => {
    const m = t.match(/\d+/);
    return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
  };
  const sortedGroup = useMemo(
    () =>
      [...group].sort(
        (a, b) =>
          tableNumber(a.table) - tableNumber(b.table) ||
          a.table.localeCompare(b.table) ||
          a.name.localeCompare(b.name)
      ),
    [group]
  );

  // Check in one more guest from the group search
  const addToGroup = async (user: User) => {
    const name = `${user.firstname} ${user.lastname}`;
    const seat = user.seat?.[0];
    if (!seat) {
      toast.error(t.noSeatYet(name));
      return;
    }
    if (group.some((g) => g.seatId === seat.id)) {
      toast(t.alreadyOnList(name));
      setGroupQuery("");
      groupInputRef.current?.focus();
      return;
    }
    setGroupBusy(user.id);
    try {
      const response = await fetch("/api/seat-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatId: seat.id }),
      });
      const data = await response.json();
      if (data.success) {
        setGroup((g) => [...g, { seatId: seat.id, name, table: seat.table.name }]);
        toast.success(t.guestArrived(name));
        setGroupQuery("");
        groupInputRef.current?.focus();
      } else {
        toast.error(t.couldNotCheckIn);
      }
    } catch (err) {
      console.error(err);
      toast.error(t.couldNotCheckIn);
    } finally {
      setGroupBusy(null);
    }
  };

  // Search guests as the person types. This page is used by guests on their
  // own phones (not logged in), so it uses the public search, which returns at
  // most 5 matches, instead of downloading the whole guest list.
  // Opened from an event's QR code (?event=...): this phone uses that event,
  // so guests only find names from their own event (several can run at once)
  const [eventName, setEventName] = useState<string | null>(null);
  // Which event this phone is on. Empty = the general QR code: search every event.
  const [eventId, setEventId] = useState<string | null>(null);
  // this event is closed to guests (past, or closed by the organizer)
  const [eventClosed, setEventClosed] = useState(false);
  const chooseEvent = (id: string) => {
    setEventId(id);
    // remembers the event on this phone (for "more guests" and the floor map)
    fetch(`/api/event-info?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => j.success && setEventName(j.event.name))
      .catch(() => undefined);
  };
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("event");
    if (!id) {
      setIsLoading(false);
      return;
    }
    setEventId(id);
    fetch(`/api/event-info?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setEventName(j.event.name);
      })
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, []);
  useEffect(() => {
    const q = searchValue.trim();
    if (q.length < 2) {
      setAllUsers([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/find-guest?q=${encodeURIComponent(q)}${eventId ? `&event=${encodeURIComponent(eventId)}` : "&all=1"}`);
        const data = await response.json();
        if (!cancelled && data.success) {
          setAllUsers(data.data);
          setEventClosed(!!data.closed);
        }
      } catch (error) {
        console.error("Error searching guests:", error);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchValue, eventId]);

  // Fetch floor map
  const fetchFloorMap = async () => {
    // Phones: open the map full screen and turn it sideways so it's big.
    // (Android allows locking to landscape; iPhone gets the map turned for it.)
    try {
      if (window.matchMedia("(max-width: 900px)").matches && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      }
    } catch {
      /* not allowed here: the map still opens */
    }
    setLoadingFloorMap(true);
    try {
      const response = await fetch(
        `/api/floor-map${eventId || selectedUser?.eventId ? `?event=${encodeURIComponent(eventId || selectedUser?.eventId || "")}` : ""}`
      );
      const data = await response.json();

      // where the guest's table is, and the doors (to draw the way)
      setWay(null);
      if (searchResult?.seatId) {
        try {
          const w = await fetch(`/api/wayfind?seatId=${encodeURIComponent(searchResult.seatId)}`).then((r) => r.json());
          if (w.success && w.table?.x != null && w.table?.y != null) setWay({ table: w.table, entrances: w.entrances ?? [] });
        } catch {
          /* the map still opens, just without the line */
        }
      }

      if (data.image) {
        setFloorMapImage(data.image);
        setIsFloorMapOpen(true);
      } else {
        toast.error(t.noMap);
      }
    } catch (error) {
      console.error("Failed to fetch floor map:", error);
      toast.error(t.mapFail);
    } finally {
      setLoadingFloorMap(false);
    }
  };

  // Filter users based on search input
  const filteredUsers = useMemo(() => {
    if (!searchValue) return [];

    const all = allUsers.filter((user) => matches(`${user.firstname} ${user.lastname}`, searchValue));
    return (all.length ? all : allUsers.filter((user) => matchesAny(`${user.firstname} ${user.lastname}`, searchValue)))
      .slice(0, 5); // Limit to 5 results
  }, [searchValue, allUsers]);

  // ---- Say your name (the phone's speech recognition, where available) ----
  type Rec = {
    lang: string;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onerror: ((e: { error?: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
  };
  const recRef = useRef<Rec | null>(null);
  const [listening, setListening] = useState(false);
  // microphone problem: a centred pop-up explains the fix
  const [micHelp, setMicHelp] = useState<string | null>(null);
  const [canListen, setCanListen] = useState(false);
  // iPhone / iPad: the browser's voice search needs a setting turned on, but
  // the keyboard's own 🎤 works right away, so the button opens the keyboard
  const [isIos, setIsIos] = useState(false);
  const [kbHint, setKbHint] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const ios =
      /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIos(ios);
    setCanListen(ios || !!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  const openKeyboardMic = () => {
    nameInputRef.current?.focus();
    setKbHint(true);
    window.setTimeout(() => setKbHint(false), 9000);
  };
  const startListening = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) return;
    try {
      const rec = new R();
      // Kreyòl isn't offered by phones: French understands the names best
      rec.lang = lang === "es" ? "es-US" : lang === "fr" || lang === "ht" ? "fr-FR" : "en-US";
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let said = "";
        for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
        // names only: drop "my name is", punctuation
        said = said.replace(/^(my name is|i am|i'm|me llamo|je m'appelle|mwen rele)\s+/i, "").replace(/[.,!?]/g, "").trim();
        if (said) setSearchValue(said);
      };
      rec.onerror = (e) => {
        setListening(false);
        const ua = navigator.userAgent;
        const iphone = /iPhone|iPad|iPod/i.test(ua);
        const inApp = /FBAN|FBAV|Instagram|Line\/|wv\)|GSA\//i.test(ua);
        const err = e?.error ?? "";
        if (err === "no-speech" || err === "aborted") return setMicHelp(t.micNothing);
        const show = (msg: string) => setMicHelp(msg);
        if (inApp) return show(t.micInApp);
        if (err === "service-not-allowed" && iphone) return show(t.micIphone);
        if (err === "not-allowed" || err === "service-not-allowed") return show(t.micDenied);
        show(t.micBlocked);
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
      setMicHelp(t.micBlocked);
    }
  };
  const stopListening = () => {
    recRef.current?.stop();
    setListening(false);
  };

  // "Close" on the group card: everyone is checked in, back to an empty search
  const closeGroup = () => {
    setGroupMode(null);
    setGroup([]);
    setGroupQuery("");
    setSelectedUser(null);
    setSearchResult(null);
    setSeatIsReceived(false);
    setTableNotes(null);
    setSearchValue("");
    window.setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  // "Close" on the Seat not available pop-up: back to an empty search
  const closeNoSeat = () => {
    setNoSeatFound(false);
    setSelectedUser(null);
    setSearchResult(null);
    setSearchValue("");
    window.setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  // "Refresh" on the Seat not available pop-up: ask again (the desk may have released the seat)
  const [refreshing, setRefreshing] = useState(false);
  const refreshSeat = async () => {
    if (!selectedUser) return;
    setRefreshing(true);
    try {
      const q = `${selectedUser.firstname} ${selectedUser.lastname}`;
      const res = await fetch(`/api/find-guest?q=${encodeURIComponent(q)}${eventId ? `&event=${encodeURIComponent(eventId)}` : "&all=1"}`);
      const data = await res.json();
      const me = (data?.data as User[] | undefined)?.find((u) => u.id === selectedUser.id);
      if (me?.seat?.length) {
        await handleUserSelect(me);
      } else {
        toast(t.stillNotAssigned);
      }
    } catch {
      toast(t.stillNotAssigned);
    } finally {
      setRefreshing(false);
    }
  };

  const handleUserSelect = async (user: User) => {
    // General QR code: from now on this phone uses the guest's own event
    if (!eventId && user.eventId) chooseEvent(user.eventId);
    setSelectedUser(user);
    setSearchValue(`${user.firstname} ${user.lastname}`);
    setNoSeatFound(false);
    setSeatIsReceived(false);
    setTableNotes(null); // Reset notes
    setGroupMode(null);
    setGroup([]);
    setAskMore(false);

    if (user.seat && user.seat.length > 0) {
      const seat = user.seat[0];
      let seatCheckData = null;

      try {
        const response = await fetch(`/api/get-seat-checkin?seatId=${seat.id}`);
        seatCheckData = await response.json();

        if (seatCheckData?.success) {
          setSeatIsReceived(seatCheckData.data.isReceived);
          setTableNotes(seatCheckData.data.table?.notes || null); // Store notes

          if (seatCheckData.data.isReceived) {
            toast.success(t.welcomeBack);
          }
        }
      } catch (error) {
        console.error("Error checking seat status:", error);
      }

      setSearchResult({
        table: seat.table.name,
        seat: seat.seat,
        name: `${user.firstname} ${user.lastname}`,
        seatId: seat.id,
      });
    } else {
      setSearchResult(null);
      setNoSeatFound(true); // the Seat not available pop-up says it
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-zinc-950">
      {/* Main Content */}
      {/* centred top to bottom in the part of the screen you can actually see
          (100dvh leaves out the phone browser's own bars) */}
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center px-3 py-3 sm:p-6 lg:p-8">
        <div className="mx-auto w-full max-w-md space-y-3 sm:space-y-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-2xl px-4 py-3 sm:p-6 shadow-2xl shadow-lime-500/10"
          >
            {/* Logo */}
            <Link
              href="/"
              className="flex justify-center items-center space-x-2"
            >
              <Image
                src="/logo.svg"
                unoptimized
                alt="Seating4U Logo"
                width={150}
                height={200}
              />
            </Link>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsQrOpen(true)}
                className="sm:flex hidden h-12 w-12 rounded-xl bg-white dark:bg-zinc-900 hover:bg-lime-50 dark:hover:bg-zinc-800 border-0 shadow-lg shadow-lime-500/10 hover:shadow-lime-500/20 transition-all duration-300"
              >
                <QrCode className="h-5 w-5 text-green-600" />
              </Button>
            </div>
          </motion.div>

          {/* Language */}
          <div className="flex justify-center gap-1.5">
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  lang === l.id ? "bg-green-600 text-white" : "bg-white text-zinc-600 shadow-sm hover:bg-lime-50"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* Search Form (hidden while checking in a group) */}
          {!groupMode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {/* Bright green card, same style as the pop-ups */}
            <Card className="relative overflow-hidden rounded-2xl border-[3px] border-lime-400 bg-gradient-to-br from-lime-50 via-white to-emerald-50 shadow-2xl shadow-lime-500/25">
              <div className="h-2 bg-gradient-to-r from-lime-400 via-emerald-500 to-lime-400" />
              <CardHeader className="pb-2">
                <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-700">
                  <MapPin className="h-5 w-5" /> {eventName || "Seating4U"}
                </p>
                <CardTitle className="text-3xl font-extrabold leading-tight text-emerald-950">
                  {t.findSeat}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="name"
                      className="text-lg font-semibold text-emerald-900"
                    >
                      {t.searchName}
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-zinc-400" />
                      <Input
                        ref={nameInputRef}
                        id="name"
                        placeholder={
                          isLoading
                            ? t.loading
                            : t.startTyping
                        }
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        disabled={isLoading}
                        className={`pl-10 h-16 text-lg font-medium border-2 border-lime-300 bg-white shadow-inner focus:border-emerald-500 focus:ring-4 focus:ring-lime-300/40 transition-all rounded-xl ${
                          canListen ? "pr-16" : ""
                        }`}
                      />
                      {/* Say your name instead of typing it */}
                      {canListen && (
                        <button
                          type="button"
                          onClick={isIos ? openKeyboardMic : listening ? stopListening : startListening}
                          className={`absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full ${
                            listening ? "animate-pulse bg-red-600 text-white" : "bg-lime-600 text-white hover:bg-lime-700"
                          }`}
                          aria-label={t.sayName}
                          title={t.sayName}
                        >
                          <Mic className="h-6 w-6" />
                        </button>
                      )}
                    </div>
                    {listening && (
                      <p className="mt-1 text-center text-base font-semibold text-red-600">{t.listening}</p>
                    )}
                    {kbHint && (
                      <p className="mt-2 rounded-xl border-2 border-sky-400 bg-sky-50 px-3 py-2 text-center text-base font-bold text-sky-900">
                        {t.useKeyboardMic}
                      </p>
                    )}

                    {/* Search Results */}
                    {searchValue && !isLoading && (
                      <Card className="mt-2 border-0 shadow-lg">
                        <CardContent className="p-2">
                          {filteredUsers.length > 0 ? (
                            <div className="space-y-1">
                              {filteredUsers.map((user) => (
                                <button
                                  key={user.id}
                                  onClick={() => handleUserSelect(user)}
                                  className={cn(
                                    "w-full flex items-center px-4 py-3 rounded-lg text-left text-base sm:text-lg",
                                    "hover:bg-lime-50 dark:hover:bg-lime-900/20",
                                    "transition-colors duration-150",
                                    selectedUser?.id === user.id &&
                                      "bg-lime-50 dark:bg-lime-900/20"
                                  )}
                                >
                                  <Check
                                    className={cn(
                                      "mr-3 h-5 w-5",
                                      selectedUser?.id === user.id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  <span className="flex-1 font-medium">
                                    {user.firstname} {user.lastname}
                                  </span>
                                  {/* general QR code: say which event, when matches come from several */}
                                  {!eventId &&
                                    user.eventName &&
                                    new Set(filteredUsers.map((u) => u.eventId)).size > 1 && (
                                      <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                                        {user.eventName}
                                      </span>
                                    )}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div
                              className={`p-4 text-center text-base ${
                                eventClosed ? "font-semibold text-amber-800" : "text-zinc-500"
                              }`}
                            >
                              {eventClosed ? t.eventClosed : t.noMatch}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          )}

          {/* Search Result or No Seat Message */}
          <AnimatePresence mode="wait">
            {searchResult ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
<Card className="border-0 shadow-2xl shadow-lime-500/10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl overflow-hidden">
  <CardContent className="pt-6">
    <div className="space-y-6">

      {/* Table Notes - Show if available */}
      {tableNotes && groupMode !== "done" && (
        <div className="p-4 rounded-xl bg-yellow-50/50 dark:bg-yellow-900/20 border-l-4 border-yellow-400">
          <div className="flex items-start gap-2">
            <span className="text-yellow-600 dark:text-yellow-400 mt-0.5">
              📝
            </span>
            <div>
              <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-1">
                {t.tableNote}
              </p>
              <p className="text-base text-yellow-800 dark:text-yellow-300">
                {tableNotes}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Name Display - Always visible */}
        <div className="max-w-full flex items-center justify-center">
        <span className="font-semibold text-center text-4xl sm:text-4xl text-zinc-800 dark:text-zinc-200">
          {searchResult.name}
        </span>
        </div>
      
      {seatIsReceived && groupMode === "adding" ? (
        // Checking in the rest of the group: the search stays up
        <div className="space-y-4">
          <p className="text-center text-lg font-semibold text-zinc-700">
            {t.findEach}
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
            <Input
              ref={groupInputRef}
              autoFocus
              placeholder={t.typeGuest}
              value={groupQuery}
              onChange={(e) => setGroupQuery(e.target.value)}
              className="pl-10 h-14 text-lg rounded-xl"
            />
          </div>
          {groupQuery.trim().length >= 2 && (
            <div className="rounded-xl border bg-white p-1">
              {groupResults.length === 0 ? (
                <p className="p-3 text-center text-zinc-500">No matching names found</p>
              ) : (
                groupResults.map((u) => {
                  const seat = u.seat?.[0];
                  const done = !!seat && group.some((g) => g.seatId === seat.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={!!groupBusy || done}
                      onClick={() => addToGroup(u)}
                      className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left text-lg hover:bg-lime-50 disabled:opacity-60"
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded border",
                          done ? "border-green-600 bg-green-600 text-white" : "border-zinc-300"
                        )}
                      >
                        {done && <Check className="h-4 w-4" />}
                      </span>
                      <span className="flex-1 font-medium">
                        {u.firstname} {u.lastname}
                      </span>
                      <span className="text-sm text-zinc-500">
                        {groupBusy === u.id ? "..." : seat ? seat.table.name : t.noSeat}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
          <ArrivedList items={sortedGroup} title={t.arrivedHeader} />
          <Button
            onClick={() => {
              setGroupMode("done");
              setGroupQuery("");
            }}
            className="w-full h-16 text-2xl font-bold rounded-xl bg-green-600 text-white hover:bg-green-700"
          >
            {t.done}
          </Button>
        </div>
      ) : seatIsReceived && groupMode === "done" ? null : seatIsReceived ? (
        // Show seat details after check-in
        <>
          <div className="flex justify-center items-center gap-3 flex-col pb-4">
            <span className="text-3xl sm:text-4xl font-bold text-green-600 dark:text-lime-400">
              {t.youreOn}
            </span>
            <span className="font-bold text-6xl sm:text-7xl text-zinc-800 dark:text-zinc-200">
              {searchResult.table}
            </span>
          </div>
          
          {/* Floor Map Button */}
          <Button
            onClick={fetchFloorMap}
            disabled={loadingFloorMap}
            className="w-full h-16 text-xl sm:text-2xl rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
          >
            {loadingFloorMap ? (
              t.loadingShort
            ) : (
              <>
                <MapPin className="mr-3 h-6 w-6" />
                {t.viewLocation}
              </>
            )}
          </Button>
          
          {/* Already arrived card */}
          <div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-xl text-center space-y-3">
            <div className="h-20 w-20 bg-green-100 dark:bg-green-800/30 rounded-full flex items-center justify-center mx-auto">
              <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-2xl sm:text-3xl font-semibold text-green-700 dark:text-green-400">
              {t.welcome}
            </h3>
            <p className="text-base sm:text-lg text-green-600 dark:text-green-500">
              {t.checkedIn}
            </p>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {/* Instruction message */}
          <div className="p-5 bg-amber-50 dark:bg-amber-900/20 rounded-xl border-2 border-amber-200 dark:border-amber-800">
            <p className="text-base sm:text-lg text-amber-800 dark:text-amber-200 text-center font-medium leading-relaxed">
              <span dangerouslySetInnerHTML={{ __html: t.pressArrived }} />
            </p>
          </div>
          
          {/* Check In button */}
          <Button
            onClick={async () => {
              if (!searchResult) return;
              try {
                setIsLoading(true);
                const response = await fetch(
                  "/api/seat-checkin",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      seatId: searchResult.seatId,
                    }),
                  }
                );
                const data = await response.json();
                if (data.success) {
                  setSeatIsReceived(true);
                  toast.success(t.welcomeName(searchResult.name));
                  setGroup([
                    {
                      seatId: searchResult.seatId,
                      name: searchResult.name,
                      table: searchResult.table,
                    },
                  ]);
                  setAskMore(true);
                } else {
                  toast.error(
                    t.couldNotCheckIn
                  );
                }
              } catch (err) {
                console.error(err);
                toast.error(t.couldNotCheckIn);
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
            className="w-full h-20 text-2xl sm:text-3xl font-bold rounded-xl bg-green-600 text-white hover:bg-green-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
          >
            {isLoading ? t.processing : t.arrived}
          </Button>
        </div>
      )}
    </div>
  </CardContent>
</Card>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* After "Arrived": did more guests come along? */}
      <Dialog open={askMore} onOpenChange={setAskMore}>
        <DialogContent className="w-[92vw] max-w-sm rounded-2xl p-6">
          <DialogTitle className="text-center text-2xl">{t.moreGuests}</DialogTitle>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              className="h-14 text-xl font-bold rounded-xl bg-green-600 text-white hover:bg-green-700"
              onClick={() => {
                setAskMore(false);
                setGroupMode("adding");
              }}
            >
              {t.yes}
            </Button>
            <Button
              variant="outline"
              className="h-14 text-xl font-bold rounded-xl"
              onClick={() => setAskMore(false)}
            >
              {t.no}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={isQrOpen} onOpenChange={setIsQrOpen}>
        <DialogContent
          className={cn(
            "flex flex-col p-0 bg-white dark:bg-zinc-900 backdrop-blur-xl",
            "w-[95vw] max-w-sm h-[400px] rounded-2xl border-0",
            "sm:w-[85vw] md:w-[75vw] h-fit-content",
            "shadow-2xl shadow-lime-500/10"
          )}
        >
          <div className="relative w-full aspect-square sm:aspect-video md:aspect-[4/3] lg:aspect-[16/16]">
            <Image
              src="/qr-code-for-seating4u.svg"
              alt="QR Code for Seating4U"
              className="object-contain h-[400px] w-[400px] p-7"
              priority
              height={300}
              width={300}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Done with the group: just the names and their tables, until Close */}
      {groupMode === "done" && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border-4 border-green-500 bg-white shadow-2xl">
            <div className="bg-green-600 px-5 py-3 text-center">
              <p className="text-sm font-bold uppercase tracking-wide text-green-100">{t.arrivedHeader} ✓</p>
              <p className="text-2xl font-extrabold text-white">{t.yourGroup}</p>
            </div>
            <ul className="max-h-[55dvh] divide-y divide-green-100 overflow-y-auto px-4">
              {sortedGroup.map((g) => (
                <li key={g.seatId} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-lg font-semibold text-zinc-900">{g.name}</span>
                  <span className="whitespace-nowrap rounded-lg bg-green-100 px-2.5 py-1 text-lg font-extrabold text-green-800">
                    {g.table}
                  </span>
                </li>
              ))}
            </ul>
            <div className="p-4">
              <button
                type="button"
                onClick={closeGroup}
                className="h-14 w-full rounded-xl bg-green-600 text-xl font-bold text-white shadow hover:bg-green-700"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Microphone problem: centred, bold outline, until OK */}
      {micHelp && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-sm rounded-2xl border-[3px] border-sky-400 bg-sky-50 p-5 text-center shadow-2xl">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-sky-100">
              <Mic className="h-7 w-7 text-sky-700" />
            </div>
            <p className="text-sm font-bold uppercase tracking-wide text-sky-700">{t.sayName}</p>
            <p className="mt-2 text-lg font-semibold leading-snug text-sky-950">{micHelp}</p>
            <button
              type="button"
              onClick={() => setMicHelp(null)}
              className="mt-5 h-14 w-full rounded-xl bg-sky-600 text-xl font-bold text-white shadow hover:bg-sky-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Seat not available: stays until the guest refreshes or closes it */}
      {noSeatFound && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-sm rounded-2xl border-4 border-amber-400 bg-amber-50 p-5 text-center shadow-2xl">
            <button
              type="button"
              onClick={closeNoSeat}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none text-amber-900 hover:bg-amber-100"
              aria-label={t.close}
            >
              ×
            </button>
            <p className="flex items-center justify-center gap-2 px-8 text-base font-extrabold uppercase tracking-wide text-amber-700">
              <HelpCircle className="h-5 w-5" /> {t.notAvailable}
            </p>
            {selectedUser && (
              <p className="mt-2 text-2xl font-extrabold leading-tight text-amber-950">
                {selectedUser.firstname} {selectedUser.lastname}
              </p>
            )}
            <p className="text-lg font-bold leading-snug text-amber-950">{t.notAssigned}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={refreshSeat}
                disabled={refreshing}
                className="h-14 rounded-xl bg-green-600 text-xl font-bold text-white shadow hover:bg-green-700 disabled:opacity-60"
              >
                {refreshing ? "…" : t.refresh}
              </button>
              <button
                type="button"
                onClick={closeNoSeat}
                className="h-14 rounded-xl border border-zinc-300 bg-white text-xl font-bold text-zinc-900 shadow-sm hover:bg-zinc-50"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floor map: full screen, turned sideways on a phone held upright */}
      {isFloorMapOpen && (
        <MapViewer
          src={floorMapImage?.data ?? null}
          title={way ? way.table.name : t.floorPlan}
          hint={way ? (way.entrances.length ? t.followLine : t.circled) : ""}
          onClose={() => setIsFloorMapOpen(false)}
        >
          {way && <WayOverlay way={way} youAreHere={t.youAreHere} yourTable={t.yourTable} />}
        </MapViewer>
      )}
    </div>
  );
}

// The list of everyone checked in together: name and table, sorted by table
function ArrivedList({ items, title = "Arrived" }: { items: { seatId: string; name: string; table: string }[]; title?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-green-200 bg-white">
      <div className="flex items-center justify-between bg-green-50 px-4 py-2">
        <span className="text-xl font-bold text-green-800">{title}</span>
        <span className="text-xl font-bold text-green-800 tabular-nums">{items.length}</span>
      </div>
      <table className="w-full">
        <tbody>
          {items.map((g) => (
            <tr key={g.seatId} className="border-t border-green-100">
              <td className="px-4 py-2 text-lg text-zinc-800">{g.name}</td>
              <td className="px-4 py-2 text-right text-base font-bold text-green-800 whitespace-nowrap">
                {g.table}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- The way from the door to the guest's table, drawn over the floor plan ----
type Way = {
  table: { name: string; x: number; y: number; w: number | null; h: number | null; shape: string | null };
  entrances: { x: number; y: number }[];
};

function WayOverlay({ way, youAreHere, yourTable }: { way: Way; youAreHere: string; yourTable: string }) {
  const t = way.table;
  // the door closest to the table
  const door = way.entrances.length
    ? [...way.entrances].sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0]
    : null;
  const ringW = Math.max(5, (t.w ?? 7) * 1.45);
  const round = (t.shape ?? "round") === "round";
  return (
    <div className="pointer-events-none absolute inset-0">
      <style>{`
        @keyframes wayDash { to { stroke-dashoffset: -36 } }
        .way-dash { animation: wayDash 0.9s linear infinite }
        @keyframes wayRing { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.2); opacity: .55 } }
        .way-ring { animation: wayRing 1.2s ease-in-out infinite }
        @keyframes wayPulse { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity: 1 } 50% { transform: translate(-50%,-50%) scale(1.25); opacity: .6 } }
        .way-pulse { animation: wayPulse 1.2s ease-in-out infinite }
      `}</style>
      {door && <WayLine door={door} table={t} halfW={ringW / 2} />}
      {/* the guest's table: a pulsing ring with a label above it */}
      <div
        className="absolute"
        style={{
          left: `${t.x}%`,
          top: `${t.y}%`,
          width: `${ringW}%`,
          transform: "translate(-50%, -50%)",
          ...(t.h && !round ? { height: `${t.h * 1.45}%` } : { aspectRatio: "1" }),
        }}
      >
        <div
          className={`way-ring absolute inset-0 border-[5px] border-red-500 bg-red-500/15 shadow-[0_0_0_4px_white] ${round ? "rounded-full" : "rounded-lg"}`}
        />
        <div className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white shadow-lg">
          {yourTable} · {t.name}
        </div>
      </div>
      {/* the door: you are here */}
      {door && (
        <>
          <div
            className="way-pulse absolute h-5 w-5 rounded-full bg-green-600 shadow-[0_0_0_5px_rgba(255,255,255,.9)]"
            style={{ left: `${door.x}%`, top: `${door.y}%` }}
          />
          <div
            className="absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-green-600 px-3 py-1 text-sm font-bold text-white shadow-lg"
            style={{ left: `${door.x}%`, top: `calc(${door.y}% + 1rem)` }}
          >
            {youAreHere}
          </div>
        </>
      )}
    </div>
  );
}

// The green line: straight in from the door, then a turn toward the table
// (like walking it). It draws itself in, then keeps flowing.
function WayLine({
  door,
  table,
  halfW,
}: {
  door: { x: number; y: number };
  table: { x: number; y: number };
  halfW: number;
}) {
  // which wall is the door on? Walk straight in from that wall first.
  const dist = [door.x, 100 - door.x, door.y, 100 - door.y];
  const sideWall = Math.min(dist[0], dist[1]) < Math.min(dist[2], dist[3]); // left/right wall
  const pts: [number, number][] = [[door.x, door.y]];
  if (sideWall) {
    // across first, then up/down to the table
    const dy = table.y - door.y;
    if (Math.abs(dy) < halfW) pts.push([table.x - Math.sign(table.x - door.x) * halfW, door.y]);
    else {
      pts.push([table.x, door.y]);
      pts.push([table.x, table.y - Math.sign(dy) * halfW]);
    }
  } else {
    // up/down first, then across to the table
    const dx = table.x - door.x;
    if (Math.abs(dx) < halfW) pts.push([door.x, table.y - Math.sign(table.y - door.y) * halfW]);
    else {
      pts.push([door.x, table.y]);
      pts.push([table.x - Math.sign(dx) * halfW, table.y]);
    }
  }
  // draw-in animation
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1400);
      setP(1 - Math.pow(1 - k, 2));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [door.x, door.y, table.x, table.y]);
  const lens = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  let left = total * p;
  const shown: [number, number][] = [pts[0]];
  for (let i = 0; i < lens.length && left > 0; i++) {
    const k = Math.min(1, left / (lens[i] || 1));
    shown.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]);
    left -= lens[i];
  }
  const d = shown.map((q) => q.join(",")).join(" ");
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke="white" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <polyline
        points={d}
        fill="none"
        stroke="#16a34a"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={p < 1 ? undefined : "14 10"}
        vectorEffect="non-scaling-stroke"
        className={p < 1 ? undefined : "way-dash"}
      />
    </svg>
  );
}

// Full-screen floor map for the guest's phone. A wide plan on a phone held
// upright is shown turned sideways so it fills the screen (Android also locks
// the screen to landscape); turn the phone and it reads normally.
function MapViewer({
  src,
  title,
  hint,
  onClose,
  children,
}: {
  src: string | null;
  title: string;
  hint: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [ratio, setRatio] = useState(1.4);
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 400 : window.innerWidth));
  const [vh, setVh] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  useEffect(() => {
    const on = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  // Android: lock to landscape while the map is open (only works full screen)
  useEffect(() => {
    if (ratio <= 1.1) return;
    const o = (screen as Screen & { orientation?: { lock?: (x: string) => Promise<void>; unlock?: () => void } }).orientation;
    o?.lock?.("landscape").catch(() => undefined);
    return () => {
      try {
        o?.unlock?.();
      } catch {
        /* nothing to undo */
      }
    };
  }, [ratio]);
  const close = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    onClose();
  };
  // turn the map when the phone is upright and the plan is wide
  const turned = vh > vw && ratio > 1.1;
  const boxW = turned ? vh : vw; // the space the map has, once turned
  const boxH = turned ? vw : vh;
  const top = 64; // title bar
  const fitW = Math.min(boxW - 16, (boxH - top - 12) * ratio);
  const fitH = fitW / ratio;

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-100">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: boxW,
          height: boxH,
          transform: `translate(-50%, -50%)${turned ? " rotate(90deg)" : ""}`,
        }}
      >
        {/* title + close */}
        <div className="absolute inset-x-0 top-0 z-10 flex h-16 items-center gap-3 bg-white/95 px-4 shadow">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-bold text-zinc-800">{title}</div>
            {hint && <div className="truncate text-sm font-medium text-green-700">{hint}</div>}
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-white text-2xl leading-none shadow"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {/* the map, as big as it fits */}
        {src ? (
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: top + 6, width: fitW, height: fitH }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="Floor plan"
              className="absolute inset-0 h-full w-full select-none"
              draggable={false}
              onLoad={(e) => {
                const im = e.currentTarget;
                if (im.naturalWidth && im.naturalHeight) setRatio(im.naturalWidth / im.naturalHeight);
              }}
            />
            {children}
          </div>
        ) : (
          <p className="pt-24 text-center text-lg text-zinc-500">No floor map available</p>
        )}
      </div>
    </div>
  );
}
