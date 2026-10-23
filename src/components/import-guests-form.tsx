"use client";
import { fold } from "@/lib/fold";
import { onSetup } from "@/lib/setupEvents";
import { HelpTip } from "@/components/HelpTip";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Download } from "lucide-react";
import { useState , useEffect} from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { FileUpload } from "./ui/file-upload";

interface Guest {
  firstname: string;
  lastname: string;
  // optional: seat the guest at this table on import ("Table 5" or "5")
  table?: string;
  vip?: string;
  meal?: string;
  allergy?: string;
  note?: string;
  party?: number;
}

const FIELD_LIST: [keyof Fields, string, string][] = [
  ["meal", "Meal", "Chicken, Fish, Veg…"],
  ["allergy", "Allergy", "shown in red to the caterer"],
  ["vip", "VIP", "gold welcome"],
  ["note", "Note for the desk", "the desk decides before seating"],
  ["party", "Party size", "+1s and children seated together"],
];
type Fields = { meal: boolean; allergy: boolean; vip: boolean; note: boolean; party: boolean };

export function ImportGuestsforWeb({ noButton = false }: { noButton?: boolean } = {}) {
  // which optional details this event's guest list has (saved per event)
  const [fields, setFields] = useState<Fields>({ meal: false, allergy: false, vip: false, note: false, party: false });
  useEffect(() => {
    fetch("/api/guest-fields")
      .then((r) => r.json())
      .then((j) => j?.success && setFields(j.fields))
      .catch(() => undefined);
  }, []);
  const toggleField = (k: keyof Fields) => {
    const next = { ...fields, [k]: !fields[k] };
    setFields(next);
    fetch("/api/guest-fields", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: next }),
    }).catch(() => undefined);
  };
  // noButton: a copy with no menu button, opened by the setup steps
  const [open, setOpen] = useState(false);
  useEffect(() => (noButton ? onSetup("import-guests", () => setOpen(true)) : undefined), [noButton]);
  // "new": add guests from the file. "update": fill in meals / allergies / VIP
  // for guests already on the list (nobody is added twice)
  const [mode, setMode] = useState<"new" | "update">("new");
  const [updateResult, setUpdateResult] = useState<{ updated: number; notFound: string[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    success: number;
    failure: number;
  } | null>(null);
  const [importStats, setImportStats] = useState<{
    imported: number;
    total: number;
    failedGuests: Guest[];
    errors: string[];
  } | null>(null);

  const addGuest = async (guest: Guest) => {
    const response = await fetch("/api/add-guest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(guest),
    });

    if (!response.ok) {
      throw new Error(`Failed to add guest: ${response.statusText}`);
    }

    return response.json();
  };

  // Before anything is added: the file is checked and shown, problems in red
  const [check, setCheck] = useState<{
    guests: Guest[];
    skipped: { row: number; text: string }[];
    dupInFile: string[];
    onList: string[];
  } | null>(null);
  const handleFileUpload = async (files: File[]) => {
    if (!files || files.length === 0) {
      toast.error("Please choose your Excel file");
      return;
    }
    setError(null);
    setImportStats(null);
    setUpdateResult(null);
    try {
      const { guests, skipped } = await readFileData(files[0]);
      if (!guests.length) throw new Error("No guests found in this file. Each row needs a first name and a last name.");
      const key = (g: { firstname?: string; lastname?: string }) => fold(`${g.firstname ?? ""} ${g.lastname ?? ""}`).replace(/\s+/g, " ").trim();
      const count = new Map<string, number>();
      for (const g of guests) count.set(key(g), (count.get(key(g)) ?? 0) + 1);
      const dupInFile = guests.filter((g, i) => count.get(key(g))! > 1 && guests.findIndex((x) => key(x) === key(g)) === i).map((g) => `${g.firstname} ${g.lastname}`);
      let onList: string[] = [];
      if (mode === "new") {
        const j = await fetch("/api/get-guests").then((r) => r.json()).catch(() => null);
        const have = new Set(((j?.data ?? []) as { firstname: string; lastname: string }[]).map(key));
        onList = guests.filter((g) => have.has(key(g))).map((g) => `${g.firstname} ${g.lastname}`);
      }
      setCheck({ guests, skipped, dupInFile, onList });
    } catch (e) {
      const m = e instanceof Error ? e.message : "This file could not be read.";
      setError(m);
      toast.error("Please check your file", { description: m });
    }
  };

  const runImport = async (guests: Guest[]) => {
    setCheck(null);
    setIsLoading(true);
    setError(null);
    setImportProgress(null);
    setImportStats(null);
    setUpdateResult(null);

    try {

      // a copy of the event first, so the import can be undone (menu → Undo)
      await fetch("/api/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: mode === "update" ? "Update guests from Excel" : "Import guests" }),
      }).catch(() => undefined);

      if (mode === "update") {
        const res = await fetch("/api/update-guests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: guests }),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.message || "Update failed");
        setUpdateResult({ updated: j.updated, notFound: j.notFound ?? [] });
        toast.success(`${j.updated} guests updated`);
        return;
      }
      const allergyItems: { id: string; allergy: string }[] = [];
      const noteItems: { id: string; note: string }[] = [];

      const importedGuests: Guest[] = [];
      const failedGuests: Guest[] = [];
      const errors: string[] = [];

      for (let i = 0; i < guests.length; i++) {
        const guest = guests[i];
        try {
          const added = await addGuest(guest);
          if (guest.allergy && added?.data?.id) allergyItems.push({ id: added.data.id, allergy: guest.allergy });
          if (guest.note && added?.data?.id) noteItems.push({ id: added.data.id, note: guest.note });
          importedGuests.push(guest);
        } catch (error) {
          failedGuests.push(guest);
          errors.push(
            `Failed to add guest ${guest.firstname} ${guest.lastname}: ${error}`
          );
        }

        setImportProgress({
          current: i + 1,
          total: guests.length,
          success: importedGuests.length,
          failure: failedGuests.length,
        });
      }

      if (noteItems.length) {
        await fetch("/api/guest-notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: noteItems }),
        }).catch(() => undefined);
      }
      if (allergyItems.length) {
        await fetch("/api/allergies", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: allergyItems }),
        }).catch(() => undefined);
      }
      setImportStats({
        imported: importedGuests.length,
        total: guests.length,
        failedGuests,
        errors,
      });

      toast.success(
        `Successfully imported ${importedGuests.length} out of ${guests.length} guests`
      );
      // the same name more than once in the file: tell the person now
      const seen = new Map<string, { name: string; n: number }>();
      for (const g of importedGuests) {
        const name = `${g.firstname ?? ""} ${g.lastname ?? ""}`.replace(/\s+/g, " ").trim();
        const k = fold(name);
        if (!k) continue;
        const e = seen.get(k) ?? { name, n: 0 };
        e.n++;
        seen.set(k, e);
      }
      const twice = [...seen.values()].filter((e) => e.n > 1);
      if (twice.length) {
        toast.warning(`${twice.length} name${twice.length === 1 ? " is" : "s are"} in your list more than once`, {
          description: `${twice
            .slice(0, 6)
            .map((e) => `${e.name} (${e.n}×)`)
            .join(", ")}${twice.length > 6 ? "…" : ""}. They show in light red in the guest list: drag the extra one onto the red bin.`,
          duration: 15000,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      setError(errorMessage);
      toast.error("Failed to import guests", { description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const readFileData = (file: File): Promise<{ guests: Guest[]; skipped: { row: number; text: string }[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        try {
          if (!data) {
            throw new Error("No file data found");
          }

          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet);

          if (!Array.isArray(jsonData)) {
            throw new Error("Invalid file format");
          }

          const rows = jsonData as Array<Record<string, string | number>>;
          // the file must have name columns at all
          const hasNames = rows.some((r) => (r.firstname || r["First Name"] || r["FirstName"]) !== undefined);
          if (!hasNames) {
            throw new Error(
              "We couldn't find a \"First Name\" column. Download the Excel template below, copy your guests into it, and try again."
            );
          }
          const skipped: { row: number; text: string }[] = [];
          const formattedData = rows.map((row, idx) => {
            const firstname =
              row.firstname || row["First Name"] || row["FirstName"];
            const lastname =
              row.lastname || row["Last Name"] || row["LastName"];

            if (!firstname || !lastname) {
              // shown to the person before importing; the row is left out
              const text = Object.values(row).map((v) => String(v).trim()).filter(Boolean).join(" · ") || "(empty)";
              skipped.push({ row: idx + 2, text: `${!firstname ? "no first name" : "no last name"}: ${text}` });
              return null;
            }

            const table =
              row.table ?? row.Table ?? row["Table Name"] ?? row["Table Number"] ?? row["TABLE"];
            const vip = row.vip ?? row.VIP ?? row.Vip;
            const meal = row.meal ?? row.Meal ?? row.MEAL ?? row["Meal Choice"];
            const allergy =
              row.allergy ?? row.Allergy ?? row.Allergies ?? row.allergies ?? row.ALLERGY ?? row["Dietary"] ?? row["Diet"];
            const note = row.note ?? row.Note ?? row.NOTE ?? row.Notes ?? row.notes ?? row.Message ?? row.message;
            const party = Number(row["Party Size"] ?? row["Party size"] ?? row.Party ?? row.party ?? row["Party"] ?? "");
            return {
              firstname: String(firstname).trim(),
              lastname: String(lastname).trim(),
              ...(table !== undefined && String(table).trim() ? { table: String(table).trim() } : {}),
              ...(vip !== undefined && String(vip).trim() ? { vip: String(vip).trim() } : {}),
              ...(meal !== undefined && String(meal).trim() ? { meal: String(meal).trim() } : {}),
              ...(allergy !== undefined && String(allergy).trim() ? { allergy: String(allergy).trim() } : {}),
              ...(note !== undefined && String(note).trim() ? { note: String(note).trim() } : {}),
              ...(party > 1 ? { party: Math.min(20, Math.round(party)) } : {}),
            };
          });

          resolve({ guests: formattedData.filter((g): g is NonNullable<typeof g> => !!g) as Guest[], skipped });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  };

  const downloadSampleFile = (fileType: "xlsx" | "csv") => {
    // only the columns this event uses (First Name, Last Name and Table always)
    const full = [
      { firstname: "John", lastname: "Doe", Table: "1", Meal: "Chicken", Allergy: "", VIP: "", Note: "", "Party Size": "" },
      { firstname: "Jane", lastname: "Smith", Table: "1", Meal: "Fish", Allergy: "Nuts", VIP: "", Note: "", "Party Size": "2" },
      { firstname: "Ana", lastname: "Silva", Table: "Head Table", Meal: "Veg", Allergy: "", VIP: "yes", Note: "", "Party Size": "" },
      { firstname: "Paul", lastname: "Murphy", Table: "2", Meal: "", Allergy: "", VIP: "", Note: "See the organizer before seating", "Party Size": "" },
    ];
    const keep: Record<string, boolean> = { Meal: fields.meal, Allergy: fields.allergy, VIP: fields.vip, Note: fields.note, "Party Size": fields.party };
    const data = full.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !(k in keep) || keep[k])));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Guests");

    if (fileType === "xlsx") {
      // the ready-made template (headers, drop-downs and instructions)
      const a = document.createElement("a");
      a.href = "/api/guest-template"; // made with only the columns ticked above
      a.download = "Seating4U-guest-template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    } else {
      XLSX.writeFile(wb, "sample_guests.csv");
    }
  };

  // const removeDuplicates = async () => {
  //   try {
  //     setIsLoading(true);
  //     const response = await fetch("/api/remove-duplicates", {
  //       method: "POST",
  //     });

  //     if (!response.ok) {
  //       throw new Error("Failed to remove duplicates");
  //     }

  //     const data = await response.json();
  //     toast.success(
  //       `Successfully removed ${data.removedCount} duplicate users`
  //     );
  //   } catch (error) {
  //     const errorMessage =
  //       error instanceof Error ? error.message : "Unknown error occurred";
  //     toast.error("Failed to remove duplicates", { description: errorMessage });
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!noButton && (
        <DialogTrigger asChild>
          <Button variant="ghost" className="w-full !justify-start p-2">
            Import Guests
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Import Guests
            <HelpTip side="right">
              1. Tick what your list has. 2. Click <b>Excel template</b> and copy your guests into it (one guest per row).
              3. Drop the file here. You&apos;ll see your guests and any problems <b>before</b> anything is added.
            </HelpTip>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Add new guests, or update the ones already on the list */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 text-sm font-semibold">
            {([
              ["new", "Add new guests"],
              ["update", "Update meals / allergies"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setUpdateResult(null);
                  setImportStats(null);
                  setError(null);
                }}
                className={`rounded-md px-3 py-1.5 ${mode === m ? "bg-white shadow" : "text-zinc-600 hover:text-zinc-900"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "update" ? (
            <p className="text-sm text-zinc-600">
              For guests <b>already on your list</b>. Upload an Excel file with <b>First Name</b>, <b>Last Name</b> and
              any of <b>Meal</b>, <b>Allergy</b>, <b>VIP</b>, <b>Note</b>. Each guest is found by name (accents don&apos;t matter)
              and their meal, allergy or VIP is filled in. <b>Nobody is added twice</b>, and empty cells change nothing.
            </p>
          ) : (
          <div className="rounded-lg border p-3" data-testid="field-checklist">
            <p className="mb-2 text-sm font-semibold">1. What does your guest list have?</p>
            <div className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
              {["First Name", "Last Name", "Table"].map((n) => (
                <label key={n} className="flex items-center gap-2 text-zinc-500" title="Always included">
                  <input type="checkbox" checked disabled className="h-4 w-4" /> <b className="text-zinc-800">{n}</b>
                  <span className="text-xs">always</span>
                </label>
              ))}
              {FIELD_LIST.map(([k, label, hint]) => (
                <label key={k} className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={fields[k]} onChange={() => toggleField(k)} className="h-4 w-4" />
                  <b>{label}</b> <span className="text-xs text-zinc-500">{hint}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              2. Download the <b>Excel template</b> below: it only has these columns. 3. Fill it in and drop it here. Table can stay empty to
              seat guests later.
            </p>
          </div>
          )}
          <div className="w-full max-w-4xl mx-auto min-h-96 border border-dashed bg-white dark:bg-black border-neutral-200 dark:border-neutral-800 rounded-lg">
            <FileUpload onChange={handleFileUpload} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex justify-between items-center w-full gap-2">
              <Button
                variant="outline"
                onClick={() => downloadSampleFile("xlsx")}
              >
                <Download className="h-4 w-4 mr-2" />
                Excel template
              </Button>
              <Button
                variant="outline"
                onClick={() => downloadSampleFile("csv")}
              >
                <Download className="h-4 w-4 mr-2" />
                CSV Sample
              </Button>
            </div>
            {/* <Button
              variant="destructive"
              onClick={removeDuplicates}
              disabled={isLoading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove Duplicates
            </Button> */}
          </div>
          {check && (
            <div className="space-y-2 rounded-lg border-2 border-lime-300 bg-lime-50 p-3" data-testid="import-check">
              <p className="font-semibold">
                ✓ {check.guests.length} guest{check.guests.length === 1 ? "" : "s"} ready to {mode === "update" ? "update" : "add"}
              </p>
              {check.skipped.length > 0 && (
                <div className="rounded-md bg-red-50 p-2 text-sm text-red-800">
                  <b>{check.skipped.length} row{check.skipped.length === 1 ? "" : "s"} will be left out</b> (a name is missing). Fix them in Excel, or go on without them:
                  <ul className="mt-1 max-h-28 list-inside list-disc overflow-y-auto">
                    {check.skipped.map((r) => (
                      <li key={r.row}>Row {r.row}: {r.text}</li>
                    ))}
                  </ul>
                </div>
              )}
              {check.dupInFile.length > 0 && (
                <div className="rounded-md bg-red-50 p-2 text-sm text-red-800">
                  <b>In your file twice:</b> {check.dupInFile.join(", ")}
                </div>
              )}
              {check.onList.length > 0 && (
                <div className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
                  <b>Already on your guest list ({check.onList.length}):</b> {check.onList.slice(0, 12).join(", ")}
                  {check.onList.length > 12 ? "…" : ""}. Importing adds them a second time.
                </div>
              )}
              {!check.skipped.length && !check.dupInFile.length && !check.onList.length && (
                <p className="text-sm text-green-800">No problems found.</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={() => runImport(check.guests)} className="bg-lime-600 text-white hover:bg-lime-700">
                  {mode === "update" ? "Update" : "Import"} {check.guests.length} guest{check.guests.length === 1 ? "" : "s"}
                </Button>
                <Button variant="outline" onClick={() => setCheck(null)}>
                  Choose another file
                </Button>
              </div>
            </div>
          )}
          {isLoading && importProgress && (
            <div className="text-center">
              <p>Importing guests...</p>
              <Progress
                value={(importProgress.current / importProgress.total) * 100}
                className="mt-2"
              />
              <p className="text-sm mt-1">
                Processed: {importProgress.current} / {importProgress.total}{" "}
                (Success: {importProgress.success}, Failure:{" "}
                {importProgress.failure})
              </p>
            </div>
          )}
          {updateResult && (
            <div className="space-y-2 rounded-lg bg-gray-50 p-4">
              <p className="font-medium text-green-700">✓ {updateResult.updated} guests updated</p>
              {updateResult.notFound.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-amber-700">
                    Not on your list ({updateResult.notFound.length}). Check the spelling, or add them with New Guest:
                  </p>
                  <ul className="max-h-40 list-inside list-disc overflow-y-auto text-sm text-amber-700">
                    {updateResult.notFound.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-red-500">{error}</p>
            </div>
          )}
          {importStats && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <p className="font-medium">
                Imported {importStats.imported} out of {importStats.total}{" "}
                guests
              </p>
              {importStats.failedGuests.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-red-600 font-medium">
                    Failed to import:
                  </p>
                  <ul className="text-sm text-red-600 list-disc list-inside max-h-40 overflow-y-auto">
                    {importStats.failedGuests.map((guest, index) => (
                      <li key={index}>
                        {guest.firstname} {guest.lastname}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {importStats.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-red-600 font-medium">Errors:</p>
                  <ul className="text-sm text-red-600 list-disc list-inside max-h-40 overflow-y-auto">
                    {importStats.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
