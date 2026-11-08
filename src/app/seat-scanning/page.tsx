"use client";

import { BrandLogo } from "@/components/BrandLogo";
import { applyBrand, useBrand } from "@/lib/useBrand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { bestWay, type Box } from "@/lib/wayPath";
import { ArrowDown, ArrowUp, Check, DoorOpen, HelpCircle, QrCode, Search, MapPin, Mic, X } from "lucide-react";
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
  const [mapTurned, setMapTurned] = useState(false);
  const [floorMapImage, setFloorMapImage] = useState<FloorMapImage | null>(
    null
  );
  const [loadingFloorMap, setLoadingFloorMap] = useState(false);
  const [tableNotes, setTableNotes] = useState<string | null>(null);

  // Checking in a group: after "Arrived", ask if more guests came along
  type Arrived = { seatId: string; name: string; table: string };
  const [askMore, setAskMore] = useState(false);
  const [tablePop, setTablePop] = useState(false); // "Your table" pop-up after arriving
  const [mapFrom, setMapFrom] = useState<"table" | "group" | null>(null); // OK on the map goes back there
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
      if (!cancelled) setSearching(false);
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
  const brand = useBrand(); // nightclub VIP events get "Call my server" buttons
  const chooseEvent = (id: string) => {
    setEventId(id);
    // remembers the event on this phone (for "more guests" and the floor map)
    fetch(`/api/event-info?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return;
        setEventName(j.event.name);
        applyBrand(j.event.brand); // nightclub VIP events: dark, black and gold
      })
      .catch(() => undefined);
  };
  // ?show=<seatId>: opened from the dashboard ("Show the way") to show one
  // guest's way to their table right away (nothing is checked in)
  const [showOnly, setShowOnly] = useState<string | null>(null);
  const showDone = useRef(false);
  useEffect(() => {
    const seatId = new URLSearchParams(window.location.search).get("show");
    if (!seatId) return;
    setShowOnly(seatId);
    setSearchResult({ table: "", seat: 0, name: "", seatId });
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("event");
    applyBrand(null); // the normal look until this event's look is known
    if (!id) {
      setIsLoading(false);
      return;
    }
    setEventId(id);
    fetch(`/api/event-info?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setEventName(j.event.name);
          applyBrand(j.event.brand);
        }
      })
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, []);
  // looking the name up right now: say so, instead of "No matching names"
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = searchValue.trim();
    if (q.length < 2) {
      setAllUsers([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
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
  // The map and the way to the table are loaded as soon as the guest has
  // arrived, so "Show me my table" opens at once (slow phone data at venues)
  const mapPre = useRef<{ key: string; p: Promise<[{ image?: FloorMapImage; turned?: boolean }, unknown]> } | null>(null);
  const loadMapData = () => {
    const ev = eventId || selectedUser?.eventId || "";
    const seatId = searchResult?.seatId ?? "";
    const key = `${ev}|${seatId}`;
    if (mapPre.current?.key === key) return mapPre.current.p;
    const p = Promise.all([
      fetch(`/api/floor-map${ev ? `?event=${encodeURIComponent(ev)}` : ""}`).then((r) => r.json()),
      seatId ? fetch(`/api/wayfind?seatId=${encodeURIComponent(seatId)}`).then((r) => r.json()).catch(() => null) : Promise.resolve(null),
    ]) as Promise<[{ image?: FloorMapImage; turned?: boolean }, unknown]>;
    p.catch(() => {
      if (mapPre.current?.key === key) mapPre.current = null; // try again next time
    });
    mapPre.current = { key, p };
    return p;
  };
  useEffect(() => {
    if (seatIsReceived && searchResult?.seatId) loadMapData().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatIsReceived, searchResult?.seatId]);

  useEffect(() => {
    if (!showOnly || showDone.current || searchResult?.seatId !== showOnly || !eventId) return;
    showDone.current = true;
    fetchFloorMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnly, searchResult?.seatId, eventId]);

  const fetchFloorMap = async () => {
    // Phones: open the map full screen so it's as big as it can be (upright)
    try {
      if (window.matchMedia("(max-width: 900px)").matches && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      }
    } catch {
      /* not allowed here: the map still opens */
    }
    setLoadingFloorMap(true);
    try {
      const [data, wf] = await loadMapData();
      // where the guest's table is, and the doors (to draw the way)
      setWay(null);
      const w = wf as { success?: boolean; table?: Way["table"]; entrances?: Way["entrances"]; obstacles?: Way["obstacles"] } | null;
      if (w?.success && w.table?.x != null && w.table?.y != null)
        setWay({ table: w.table, entrances: w.entrances ?? [], obstacles: w.obstacles ?? [] });

      if (data.image) {
        setMapTurned(data.turned === true);
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

  // "I've arrived" (on the pop-up)
  const doArrive = async () => {
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
            };

  // Done (or the map closed): back to the start, ready for the next guest
  const startOver = () => {
    setTablePop(false);
    setAskMore(false);
    setGroupMode(null);
    setGroup([]);
    setGroupQuery("");
    setSelectedUser(null);
    setSearchResult(null);
    setSeatIsReceived(false);
    setTableNotes(null);
    setSearchValue("");
    window.scrollTo(0, 0);
    window.setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  // "Not you?" on the arrive pop-up: back to an empty search
  const notMe = () => {
    setSelectedUser(null);
    setSearchResult(null);
    setSeatIsReceived(false);
    setTableNotes(null);
    setSearchValue("");
    window.setTimeout(() => nameInputRef.current?.focus(), 50);
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
            setTablePop(true);
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
    <div className="guest-page min-h-screen bg-[#fafafa] dark:bg-zinc-950">
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
              <BrandLogo width={250} style={{ height: "auto", maxHeight: 96 }} />
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
                          ) : searching ? (
                            <div className="p-4 text-center text-base text-zinc-500">{t.searching}</div>
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
          
          {/* Nightclub VIP: call the server / order another bottle from the table */}
          {brand === "vip" && selectedUser && (
            <div className="grid grid-cols-2 gap-2" data-testid="vip-call">
              {(["server", "bottle"] as const).map((kind) => (
                <Button
                  key={kind}
                  onClick={async () => {
                    const r = await fetch("/api/vip/guest-call", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ event: selectedUser.eventId || eventId, guestId: selectedUser.id, kind }),
                    })
                      .then((x) => x.json())
                      .catch(() => null);
                    if (r?.success) toast.success(kind === "server" ? t.serverComing : t.bottleComing);
                    else toast.error(t.couldNotCheckIn);
                  }}
                  className="h-14 rounded-xl bg-green-600 text-base font-bold text-white hover:bg-green-700"
                >
                  {kind === "server" ? t.callServer : t.orderBottle}
                </Button>
              ))}
            </div>
          )}

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
            onClick={doArrive}
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

      {/* After "Arrived": did more guests come along? A screen of its own */}
      {askMore && searchResult && (
        <div className="fixed inset-0 flex flex-col items-center justify-center overflow-y-auto bg-[#e9f2e1] p-4 text-center z-[86]" data-testid="more-guests">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border-[3px] border-lime-400 bg-gradient-to-br from-lime-50 via-white to-emerald-50 shadow-2xl shadow-lime-500/25">
            <div className="h-2 bg-gradient-to-r from-lime-400 via-emerald-500 to-lime-400" />
            <div className="p-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="h-10 w-10 text-green-600" strokeWidth={3} />
              </div>
              <p className="mt-3 break-words text-xl font-bold text-emerald-900">{searchResult.name}</p>
              <p className="mt-5 text-3xl font-extrabold text-emerald-950">{t.moreGuests}</p>
              <div className="mt-7 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="h-20 rounded-2xl bg-green-600 text-3xl font-extrabold text-white shadow-lg hover:bg-green-700"
                  onClick={() => {
                    setAskMore(false);
                    setGroupMode("adding");
                  }}
                >
                  {t.yes}
                </button>
                <button
                  type="button"
                  className="h-20 rounded-2xl border-[3px] border-lime-400 bg-white text-3xl font-extrabold text-emerald-950 hover:bg-lime-50"
                  onClick={() => {
                    setAskMore(false);
                    setTablePop(true);
                  }}
                >
                  {t.no}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Found your name: a screen of its own, one big button */}
      {searchResult && !seatIsReceived && !noSeatFound && !isFloorMapOpen && (
        <div className="fixed inset-0 flex flex-col items-center justify-center overflow-y-auto bg-[#e9f2e1] p-4 text-center z-[85]" data-testid="arrive-pop">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border-[3px] border-lime-400 bg-gradient-to-br from-lime-50 via-white to-emerald-50 shadow-2xl shadow-lime-500/25">
            <div className="h-2 bg-gradient-to-r from-lime-400 via-emerald-500 to-lime-400" />
            <div className="p-6">
              <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">{t.welcome}</p>
              <p className="mt-2 break-words text-4xl font-extrabold text-emerald-950">{searchResult.name}</p>
              {tableNotes && (
                <p className="mt-4 rounded-xl bg-yellow-50 p-3 text-left text-base text-yellow-900">📝 {tableNotes}</p>
              )}
              <p className="mt-4 text-lg text-emerald-900">{t.tapArrived}</p>
              <button type="button" onClick={doArrive} disabled={isLoading} className="mt-7 h-24 w-full rounded-2xl bg-green-600 text-3xl font-extrabold text-white shadow-lg hover:bg-green-700 disabled:opacity-60">
                {isLoading ? t.processing : t.arrivedBig}
              </button>
              <button type="button" onClick={notMe} className="mt-5 text-base text-emerald-800 underline">
                {t.notMe}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Arrived: "Welcome Fritz Aristilde", a screen of its own */}
      {tablePop && searchResult && seatIsReceived && !isFloorMapOpen && (
        <div className="fixed inset-0 flex flex-col items-center justify-center overflow-y-auto bg-[#e9f2e1] p-4 text-center z-[85]" data-testid="table-pop">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border-[3px] border-lime-400 bg-gradient-to-br from-lime-50 via-white to-emerald-50 shadow-2xl shadow-lime-500/25">
            <div className="h-2 bg-gradient-to-r from-lime-400 via-emerald-500 to-lime-400" />
            <div className="p-6">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-600">
                <Check className="h-12 w-12 text-white" strokeWidth={3} />
              </div>
              <p className="mt-4 text-xl font-bold text-emerald-700">{t.welcome}</p>
              <p className="mt-1 break-words text-4xl font-extrabold text-emerald-950">{searchResult.name}</p>
              <div className="mt-5 rounded-2xl border-2 border-lime-300 bg-white px-4 py-3">
                <p className="text-lg font-semibold text-emerald-700">{t.youAreOn}</p>
                <p className="text-6xl font-extrabold text-emerald-950">{searchResult.table}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMapFrom("table");
                  fetchFloorMap();
                }}
                disabled={loadingFloorMap}
                className="mt-6 flex items-center justify-center gap-3 h-20 w-full rounded-2xl bg-blue-600 text-2xl font-extrabold text-white shadow-lg hover:bg-blue-700 disabled:opacity-60"
              >
                <MapPin className="h-7 w-7" /> {loadingFloorMap ? t.loadingShort : t.showTable}
              </button>
              <button type="button" onClick={startOver} className="mt-5 text-lg font-semibold text-emerald-800 underline">
                {t.done}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Done with the group: just the names and their tables, until Close */}
      {groupMode === "done" && (
        <div className="fixed inset-0 flex flex-col items-center justify-center overflow-y-auto bg-[#e9f2e1] p-4 text-center z-[90]">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border-[3px] border-lime-400 bg-gradient-to-br from-lime-50 via-white to-emerald-50 shadow-2xl shadow-lime-500/25">
            <div className="h-2 bg-gradient-to-r from-lime-400 via-emerald-500 to-lime-400" />
            <div className="px-5 pt-5 text-center">
              <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">{t.arrivedHeader} ✓</p>
              <p className="text-3xl font-extrabold text-emerald-950">{t.yourGroup}</p>
            </div>
            <ul className="mx-4 mt-3 max-h-[45dvh] divide-y divide-lime-200 overflow-y-auto rounded-xl border-2 border-lime-300 bg-white px-3 text-left">
              {sortedGroup.map((g) => (
                <li key={g.seatId} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-lg font-semibold text-zinc-900">{g.name}</span>
                  <span className="whitespace-nowrap rounded-lg bg-green-100 px-2.5 py-1 text-lg font-extrabold text-green-800">
                    {g.table}
                  </span>
                </li>
              ))}
            </ul>
            <div className="p-5">
              <button
                type="button"
                onClick={() => {
                  setMapFrom("group");
                  fetchFloorMap();
                }}
                disabled={loadingFloorMap}
                className="mb-3 flex items-center justify-center gap-2 h-20 w-full rounded-2xl bg-blue-600 text-2xl font-extrabold text-white shadow-lg hover:bg-blue-700 disabled:opacity-60"
              >
                <MapPin className="h-6 w-6" /> {loadingFloorMap ? t.loadingShort : t.showTable}
              </button>
              <button
                type="button"
                onClick={closeGroup}
                className="h-14 w-full rounded-2xl border-[3px] border-lime-400 bg-white text-xl font-bold text-emerald-950 hover:bg-lime-50"
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
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#e9f2e1] p-4">
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
              <HelpCircle className="h-5 w-5" /> {(selectedUser as { held?: boolean } | null)?.held ? t.welcome : t.notAvailable}
            </p>
            {selectedUser && (
              <p className="mt-2 text-2xl font-extrabold leading-tight text-amber-950">
                {selectedUser.firstname} {selectedUser.lastname}
              </p>
            )}
            <p className="text-lg font-bold leading-snug text-amber-950">
              {(selectedUser as { held?: boolean } | null)?.held ? t.seeDesk : t.notAssigned}
            </p>
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

      {/* Floor map: full screen, the right way up */}
      {isFloorMapOpen && (
        <MapViewer
          turned={mapTurned}
          src={floorMapImage?.data ?? null}
          title={way ? "" : t.floorPlan}
          hint={way ? (way.entrances.length ? t.followLine : t.circled) : ""}
          onClose={() => {
            setIsFloorMapOpen(false);
            const from = mapFrom;
            setMapFrom(null);
            // OK: back to "You are on Table 1" (or the group's list); Done there starts over
            // (that card stayed under the map)
            if (showOnly) {
              // shown from the dashboard: tell it, so its window closes
              window.parent?.postMessage("seating4u:way-closed", "*");
              setShowOnly(null);
              setSearchResult(null);
              return;
            }
            if (!from && seatIsReceived) startOver();
          }}
        >
          {way && <WayOverlay way={way} youAreHere={t.youAreHere} yourTable={t.yourTable} turned={mapTurned} />}
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
  entrances: { x: number; y: number; dir?: number }[];
  obstacles?: { x: number; y: number; w: number | null; h: number | null; round: boolean; fixed?: boolean }[];
};

function WayOverlay({ way, youAreHere, yourTable, turned = false }: { way: Way; youAreHere: string; yourTable: string; turned?: boolean }) {
  const t = way.table;
  const ringW = Math.max(5, (t.w ?? 7) * 1.45);
  const round = (t.shape ?? "round") === "round";
  // the plan's shape (width / height), to turn sizes into a real distance
  const box = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => el.offsetHeight && setAspect(el.offsetWidth / el.offsetHeight);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // the walking way: from the door that is closest ON FOOT, around the other tables
  const route = useMemo(() => {
    if (!aspect || !way.entrances.length) return null;
    // the usual table size (tables only, not the stage or bar)
    const sizes = (way.obstacles ?? []).filter((o) => !o.fixed).map((o) => o.w).filter((w): w is number => !!w && w > 0).sort((a, b) => a - b);
    const usual = t.w && t.w > 0 ? t.w : sizes.length ? sizes[Math.floor(sizes.length / 2)] : 6;
    const toBox = (o: { x: number; y: number; w: number | null; h: number | null; round: boolean }): Box => {
      const w = o.w && o.w > 0 ? o.w : usual;
      return { x: o.x, y: o.y, w, h: o.h && o.h > 0 ? o.h : w * aspect, round: o.round };
    };
    const target = toBox({ x: t.x, y: t.y, w: t.w, h: round ? null : t.h, round });
    return bestWay(way.entrances, target, (way.obstacles ?? []).map(toBox), { aspect });
  }, [aspect, way, t, round]);
  // no way found (or not measured yet): the door closest to the table
  const door =
    route?.door ??
    (way.entrances.length
      ? [...way.entrances].sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0]
      : null);
  return (
    <div ref={box} className="pointer-events-none absolute inset-0">
      <style>{`
        @keyframes wayDash { to { stroke-dashoffset: -36 } }
        .way-dash { animation: wayDash 0.9s linear infinite }
        @keyframes wayRing { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.2); opacity: .55 } }
        .way-ring { animation: wayRing 1.2s ease-in-out infinite }
        @keyframes wayPulse { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity: 1 } 50% { transform: translate(-50%,-50%) scale(1.08); opacity: .85 } }
        .way-pulse { animation: wayPulse 1.2s ease-in-out infinite }
        @keyframes wayFlash { 0%,45% { background: rgba(239,68,68,.75); border-color: #dc2626 } 50%,95% { background: rgba(250,204,21,.6); border-color: #facc15 } 100% { background: rgba(239,68,68,.75) } }
        .way-flash { animation: wayFlash .8s steps(1, end) infinite, wayRing .8s ease-in-out infinite }
        @keyframes wayBounce { 0%,100% { transform: translate(-50%, 0) } 50% { transform: translate(-50%, -14px) } }
        @keyframes wayNum { 0%,45% { opacity: 1 } 50%,95% { opacity: .25 } 100% { opacity: 1 } }
        .way-num { animation: wayNum .8s steps(1, end) infinite, wayRing .8s ease-in-out infinite }
        @keyframes wayArrow { 0%,100% { opacity: 1 } 50% { opacity: .7 } }
        .way-arrow { animation: wayArrow 1.1s ease-in-out infinite; z-index: 1 }
        .way-bounce { animation: wayBounce .7s ease-in-out infinite }
      `}</style>
      {door && aspect > 0 && <WayLine door={door} table={t} halfW={ringW / 2} path={route?.path ?? null} aspect={aspect} turned={turned} />}
      {/* the guest's table: it flashes, with a big arrow pointing at it (no label) */}
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
          className={`way-flash absolute inset-0 border-[5px] shadow-[0_0_0_4px_white] ${round ? "rounded-full" : "rounded-lg"}`}
          aria-label={`${yourTable} ${t.name}`}
        />
        {/* just the number, flashing with the table ("Table 4" -> "4") */}
        <span style={turned ? { rotate: "180deg" } : undefined} className="way-num absolute inset-0 flex items-center justify-center text-[clamp(1.25rem,5vw,2.5rem)] font-bold leading-none text-white [text-shadow:0_0_4px_#000,0_0_2px_#000]">
          {t.name.match(/\d+/)?.[0] ?? t.name}
        </span>
        {/* the arrow comes from above, or from below when the table is at the top of the room */}
        <div className={`way-bounce absolute left-1/2 text-red-600 drop-shadow-[0_0_4px_white] ${t.y < 20 ? "top-full" : "bottom-full"}`}>
          {t.y < 20 ? <ArrowUp className="h-10 w-10" strokeWidth={3} /> : <ArrowDown className="h-10 w-10" strokeWidth={3} />}
        </div>
      </div>
      {/* the door: you are here */}
      {door && (
        <>
          {/* the door: one light, see-through lime circle with the door and "Enter"
              in small letters under it, kept fully on the map even at its edge */}
          <div
            className="way-pulse absolute flex h-[50px] w-[50px] flex-col items-center justify-center rounded-full bg-lime-300/60 text-green-900 shadow-sm ring-2 ring-white/80 backdrop-blur-[1px]"
            style={{ left: `min(max(26px, ${door.x}%), calc(100% - 26px))`, top: `min(max(26px, ${door.y}%), calc(100% - 26px))` }}
          >
            <span className="flex flex-col items-center" style={turned ? { rotate: "180deg" } : undefined}>
              <DoorOpen className="h-5 w-5" strokeWidth={2.4} />
              <span className="mt-0.5 text-[10px] font-bold leading-none">{youAreHere}</span>
            </span>
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
  path,
  aspect = 1,
  turned = false,
}: {
  turned?: boolean; // map turned around: the person is turned back so they stand upright
  door: { x: number; y: number };
  table: { x: number; y: number };
  halfW: number;
  path: { x: number; y: number }[] | null; // the way around the tables, when found
  aspect?: number; // the plan's width / height, so the arrows point the right way
}) {
  // which wall is the door on? Walk straight in from that wall first.
  const dist = [door.x, 100 - door.x, door.y, 100 - door.y];
  const sideWall = Math.min(dist[0], dist[1]) < Math.min(dist[2], dist[3]); // left/right wall
  const pts: [number, number][] = [[door.x, door.y]];
  if (path && path.length > 1) pts.splice(0, 1, ...path.map((q) => [q.x, q.y] as [number, number]));
  else if (sideWall) {
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
  // the line in screen terms: each piece, its length and its direction
  const segs = pts.slice(1).map((q, i) => {
    const dx = q[0] - pts[i][0], dy = q[1] - pts[i][1];
    return { a: pts[i], dx, dy, len: Math.hypot(dx * aspect, dy), deg: (Math.atan2(dy, dx * aspect) * 180) / Math.PI };
  });
  const pointAt = (frac: number) => {
    let at = segs.reduce((n, g) => n + g.len, 0) * frac;
    for (const g of segs) {
      if (at <= g.len || g === segs[segs.length - 1]) {
        const f = g.len ? Math.min(1, at / g.len) : 0;
        // up or down the screen: seen from the back (walking to the table) or the front
        return { x: g.a[0] + g.dx * f, y: g.a[1] + g.dy * f, left: g.dx < 0, upDown: Math.abs(g.dy) > Math.abs(g.dx * aspect) };
      }
      at -= g.len;
    }
    return { x: pts[0][0], y: pts[0][1], left: false, upDown: false };
  };
  // a small person walking the way, from the door to the table, again and again
  const [walk, setWalk] = useState(0);
  useEffect(() => {
    if (p < 1) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      setWalk(((now - t0) / 9000) % 1); // one walk from the door to the table: 9 seconds
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [p]);
  const walker = p >= 1 && segs.length ? pointAt(walk) : null;
  // arrows along the line, pointing the way to walk (toward the table)
  const arrows: { x: number; y: number; deg: number }[] = [];
  if (p >= 1) {
    const L = segs.reduce((n, g) => n + g.len, 0);
    const count = Math.max(2, Math.min(6, Math.round(L / 22)));
    for (let k = 1; k <= count; k++) {
      let at = (L * k) / (count + 1);
      for (const g of segs) {
        if (at <= g.len || g === segs[segs.length - 1]) {
          const f = g.len ? Math.min(1, at / g.len) : 0;
          arrows.push({ x: g.a[0] + g.dx * f, y: g.a[1] + g.dy * f, deg: g.deg });
          break;
        }
        at -= g.len;
      }
    }
  }
  return (
    <>
    {walker && (
      <div
        className="pointer-events-none absolute"
        style={{
          left: `${walker.x}%`,
          top: `${walker.y}%`,
          // turned map: drawn upside down under the point so on screen they stand
          // upright with their feet on the line, facing the way they walk
          transform: turned
            ? `translate(-50%, 0) rotate(180deg) scaleX(${!walker.left && !walker.upDown ? -1 : 1})`
            : `translate(-50%, -100%) scaleX(${walker.left && !walker.upDown ? -1 : 1})`,
          zIndex: 2,
          opacity: walk > 0.92 ? (1 - walk) / 0.08 : walk < 0.05 ? walk / 0.05 : 1,
        }}
        aria-hidden="true"
      >
        {walker.upDown ? (
          // walking up or down the plan: the person faces the way they go
          // (from the back when walking up to the table), legs stepping in turn
          <svg width="30" height="38" viewBox="0 0 30 38" style={{ filter: "drop-shadow(0 0 1.5px white) drop-shadow(0 0 1.5px white)" }}>
            <circle cx="15" cy="5" r="4.2" fill="#14532d" />
            <path d="M15 10 L15 22" stroke="#14532d" strokeWidth="6" strokeLinecap="round" />
            <path
              d={Math.floor(walk * 26) % 2 ? "M12 12 L8 20 M18 12 L23 18" : "M12 12 L7 18 M18 12 L22 20"}
              stroke="#14532d"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <path
              d={Math.floor(walk * 26) % 2 ? "M13 22 L11 35 M17 22 L19 31" : "M13 22 L11 31 M17 22 L19 35"}
              stroke="#14532d"
              strokeWidth="3.8"
              strokeLinecap="round"
            />
          </svg>
        ) : (
        <svg width="30" height="38" viewBox="0 0 30 38" style={{ filter: "drop-shadow(0 0 1.5px white) drop-shadow(0 0 1.5px white)" }}>
          <circle cx="16" cy="5" r="4" fill="#14532d" />
          <path d="M15 10 L13 22" stroke="#14532d" strokeWidth="4.5" strokeLinecap="round" />
          <path
            d={Math.floor(walk * 26) % 2 ? "M15 12 L21 17 M14 12 L9 18" : "M15 12 L9 16 M14 12 L20 18"}
            stroke="#14532d"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d={Math.floor(walk * 26) % 2 ? "M13 22 L19 29 L20 36 M13 22 L9 30 L5 34" : "M13 22 L10 30 L8 36 M13 22 L18 29 L23 32"}
            stroke="#14532d"
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        )}
      </div>
    )}
    {arrows.map((a, i) => (
      <div
        key={i}
        className="way-arrow pointer-events-none absolute text-white"
        style={{ left: `${a.x}%`, top: `${a.y}%`, transform: `translate(-50%, -50%) rotate(${a.deg}deg)`, animationDelay: `${i * 0.18}s` }}
      >
        {/* a solid arrow head: easy to read at any angle */}
        <svg viewBox="0 0 24 24" width="32" height="32" style={{ width: 32, height: 32 }} className="drop-shadow-[0_0_2px_rgba(255,255,255,1)]" aria-hidden="true">
          <path d="M4 3 L22 12 L4 21 L9 12 Z" fill="#16a34a" stroke="white" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    ))}
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke="white" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <polyline
        points={d}
        fill="none"
        stroke="#22c55e"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={p < 1 ? undefined : "14 10"}
        vectorEffect="non-scaling-stroke"
        className={p < 1 ? undefined : "way-dash"}
      />
    </svg>
    </>
  );
}

// Full-screen floor map for the guest's phone. The plan is always shown the
// right way up (never turned sideways), as big as it fits, in the middle.
function MapViewer({
  src,
  title,
  hint,
  onClose,
  children,
  turned = false,
}: {
  turned?: boolean;
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
  const close = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    onClose();
  };
  const boxW = vw;
  const boxH = vh;
  const top = 64; // title bar
  const fitW = Math.min(boxW - 16, (boxH - top - 12) * ratio);
  const fitH = fitW / ratio;
  // the bar (hint + OK) sits right on top of the map, and the two are centred together
  const startY = Math.max(0, (boxH - (top + 6 + fitH)) / 2);

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-100">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: boxW,
          height: boxH,
          transform: "translate(-50%, -50%)",
        }}
      >
        {/* title + close */}
        <div
          className="absolute left-1/2 z-10 flex h-16 -translate-x-1/2 items-center gap-3 rounded-t-xl bg-white/95 px-4 shadow"
          style={{ top: startY, width: src ? fitW : boxW }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-bold text-zinc-800">{title}</div>
            {hint && <div className="truncate text-sm font-normal text-green-700">{hint}</div>}
          </div>
          <button
            type="button"
            onClick={close}
            className="h-10 shrink-0 rounded-lg bg-green-500 px-6 text-lg font-semibold text-white shadow-sm hover:bg-green-600"
            aria-label="OK"
          >
            OK
          </button>
        </div>
        {/* the map, as big as it fits */}
        {src ? (
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: startY + top + 6, width: fitW, height: fitH }}>
            {/* turned around like on the floor plan (the table number stays upright) */}
            <div className="absolute inset-0" style={turned ? { rotate: "180deg" } : undefined}>
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
          </div>
        ) : (
          <p className="pt-24 text-center text-lg text-zinc-500">No floor map available</p>
        )}
      </div>
    </div>
  );
}
