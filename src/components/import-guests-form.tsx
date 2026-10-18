"use client";

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
import { useState } from "react";
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
}

export function ImportGuestsforWeb() {
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

  const handleFileUpload = async (files: File[]) => {
    if (!files || files.length === 0) {
      toast.error("Please select a file to upload");
      return;
    }

    setIsLoading(true);
    setError(null);
    setImportProgress(null);
    setImportStats(null);
    setUpdateResult(null);

    try {
      const file = files[0];
      const guests = await readFileData(file);

      if (!guests || guests.length === 0) {
        throw new Error("No valid data found in the file");
      }

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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      setError(errorMessage);
      toast.error("Failed to import guests", { description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const readFileData = (file: File): Promise<Guest[]> => {
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

          const formattedData = (
            jsonData as Array<Record<string, string | number>>
          ).map((row) => {
            const firstname =
              row.firstname || row["First Name"] || row["FirstName"];
            const lastname =
              row.lastname || row["Last Name"] || row["LastName"];

            if (!firstname || !lastname) {
              throw new Error(
                "Invalid file format. Please use the column names First Name and Last Name (and Table, optional)"
              );
            }

            const table =
              row.table ?? row.Table ?? row["Table Name"] ?? row["Table Number"] ?? row["TABLE"];
            const vip = row.vip ?? row.VIP ?? row.Vip;
            const meal = row.meal ?? row.Meal ?? row.MEAL ?? row["Meal Choice"];
            const allergy =
              row.allergy ?? row.Allergy ?? row.Allergies ?? row.allergies ?? row.ALLERGY ?? row["Dietary"] ?? row["Diet"];
            const note = row.note ?? row.Note ?? row.NOTE ?? row.Notes ?? row.notes ?? row.Message ?? row.message;
            return {
              firstname: String(firstname).trim(),
              lastname: String(lastname).trim(),
              ...(table !== undefined && String(table).trim() ? { table: String(table).trim() } : {}),
              ...(vip !== undefined && String(vip).trim() ? { vip: String(vip).trim() } : {}),
              ...(meal !== undefined && String(meal).trim() ? { meal: String(meal).trim() } : {}),
              ...(allergy !== undefined && String(allergy).trim() ? { allergy: String(allergy).trim() } : {}),
              ...(note !== undefined && String(note).trim() ? { note: String(note).trim() } : {}),
            };
          });

          resolve(formattedData);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  };

  const downloadSampleFile = (fileType: "xlsx" | "csv") => {
    // "Table" is optional: fill it in and guests are seated on import
    const data = [
      { firstname: "John", lastname: "Doe", Table: "1", Meal: "Chicken", Allergy: "", VIP: "", Note: "" },
      { firstname: "Jane", lastname: "Smith", Table: "1", Meal: "Fish", Allergy: "Nuts", VIP: "", Note: "" },
      { firstname: "Ana", lastname: "Silva", Table: "Head Table", Meal: "Veg", Allergy: "", VIP: "yes", Note: "" },
      { firstname: "Paul", lastname: "Murphy", Table: "2", Meal: "", Allergy: "", VIP: "", Note: "See the organizer before seating" },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Guests");

    if (fileType === "xlsx") {
      XLSX.writeFile(wb, "sample_guests.xlsx");
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
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full !justify-start p-2">
          Import Guests
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Import Guests</DialogTitle>
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
          <p className="text-sm text-zinc-600">
            Your Excel file needs the columns <b>First Name</b> and <b>Last Name</b>. Add a <b>Table</b> column
            (like <i>5</i> or <i>Head Table</i>) and each guest is seated at that table right away; missing tables
            are created. Leave it empty to seat them later. Optional too: a <b>Meal</b> column (Chicken, Fish, Veg…),
            an <b>Allergy</b> column, a <b>VIP</b> column (put <i>yes</i> for VIP guests) and a <b>Note</b> column: a guest
            with a note does not see their seat on the phone; the desk sees the note and decides.
          </p>
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
                XLSX Sample
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
