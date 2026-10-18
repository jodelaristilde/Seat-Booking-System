import Link from "next/link";

// The in-app User Guide (Help → View Complete Guide).
// Written in the order you work: set up the room, add guests, seat them,
// then check guests in on the day.

type Step = string | { text: string; tip?: string };

function Steps({ items }: { items: Step[] }) {
  return (
    <ol className="space-y-3">
      {items.map((it, i) => {
        const s = typeof it === "string" ? { text: it } : it;
        return (
          <li key={i} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-500 text-sm font-bold text-white">
              {i + 1}
            </span>
            <div className="pt-0.5">
              <p className="text-zinc-800" dangerouslySetInnerHTML={{ __html: s.text }} />
              {s.tip && <p className="mt-1 text-sm text-zinc-500">{s.tip}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-zinc-900">{title}</h3>
      {children}
    </div>
  );
}

function Section({
  id,
  number,
  title,
  intro,
  children,
}: {
  id: string;
  number: number;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-16 scroll-mt-6">
      <div className="mb-6 flex items-center gap-3 border-b border-zinc-200 pb-3">
        <span className="text-sm font-bold uppercase tracking-wider text-lime-600">Part {number}</span>
        <h2 className="text-2xl font-light text-black">{title}</h2>
      </div>
      {intro && <p className="mb-6 text-zinc-600">{intro}</p>}
      <div className="grid gap-6">{children}</div>
    </section>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-zinc-800">{children}</div>
);

export default function UserGuide() {
  const parts = [
    ["start", "Getting started"],
    ["room", "Set up the room"],
    ["guests", "Add your guests"],
    ["seat", "Seat your guests"],
    ["day", "Event day: check-in"],
    ["extras", "Event day extras"],
    ["fix", "Fixing mistakes"],
    ["team", "Ready check, staff & kitchen"],
  ];

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-10">
          <div>
            <h1 className="mb-2 text-4xl font-light tracking-tight text-black">User Guide</h1>
            <p className="text-zinc-500">Everything you need, from an empty room to a full house.</p>
          </div>
          <Link href="/dashboard" className="bg-lime-500 px-6 py-3 font-medium text-white transition-colors hover:bg-lime-600">
            Go to the dashboard
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Video walkthrough */}
        <section className="mb-12">
          <h2 className="mb-1 text-2xl font-light text-black">Watch: how to use Seating4U</h2>
          <p className="mb-4 text-sm text-zinc-500">A 2½-minute video with voice, from setting up the room to the kitchen screen.</p>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-black shadow-sm">
            <video
              className="block aspect-video w-full"
              src="/videos/seating4u-how-to-use.mp4"
              poster="/videos/seating4u-how-to-use.jpg"
              controls
              preload="metadata"
              playsInline
            >
              Your browser can&apos;t play this video.{" "}
              <a href="/videos/seating4u-how-to-use.mp4">Download it here</a>.
            </video>
          </div>
        </section>

        {/* Contents */}
        <nav className="mb-12 rounded-xl border border-zinc-200 bg-white p-5">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">In this guide</p>
          <ol className="grid gap-2 sm:grid-cols-2">
            {parts.map(([id, label], i) => (
              <li key={id}>
                <a href={`#${id}`} className="text-zinc-800 hover:text-lime-700 hover:underline">
                  {i + 1}. {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* 1 */}
        <Section id="start" number={1} title="Getting started">
          <Card title="Log in">
            <Steps
              items={[
                "Go to <b>www.seating4u.com</b> and log in with your username and password.",
                "You land on the <b>dashboard</b>: the floor plan in the middle, <b>Guest Names</b> on the right.",
              ]}
            />
          </Card>
          <Card title="The numbers at the top">
            <div className="grid gap-3 sm:grid-cols-5">
              {[
                ["Seats", "All seats at all tables", "bg-zinc-50 border-zinc-200 text-zinc-600"],
                ["Invited", "Guests on your list", "bg-cyan-50 border-cyan-200 text-cyan-700"],
                ["Assigned", "Guests with a seat", "bg-red-50 border-red-200 text-red-700"],
                ["Available", "Empty seats left", "bg-green-50 border-green-200 text-green-700"],
                ["Arrived", "Guests checked in", "bg-blue-50 border-blue-200 text-blue-700"],
              ].map(([t, d, c]) => (
                <div key={t} className={`rounded-lg border p-3 text-center ${c}`}>
                  <div className="text-xs font-semibold uppercase tracking-wider">{t}</div>
                  <div className="mt-1 text-xs text-zinc-600">{d}</div>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        {/* 2 */}
        <Section
          id="room"
          number={2}
          title="Set up the room"
          intro="Upload the venue's floor plan once, then put your tables on it. Any picture or PDF works: line drawings, colour plans, phone photos."
        >
          <Card title="Upload the floor plan">
            <Steps
              items={[
                "Click <b>FLOOR MAP</b> at the top.",
                { text: "Click <b>Click to upload</b> and choose the picture or PDF from the venue.", tip: "The picture is cleaned up and sharpened for you." },
                "Click <b>Upload Floor Map</b>. Uploading a new one replaces the old picture.",
              ]}
            />
          </Card>

          <Card title="Set the number of seats per table">
            <Steps
              items={[
                "In the menu next to the floor plan, find <b>Seats per table</b> (10 is the default).",
                "Type the number you want. Every table you add from now on gets that many seats.",
                { text: "Already have tables? Click <b>Set all tables</b> to give every table that number.", tip: "A seat with a guest on it is never removed." },
              ]}
            />
          </Card>

          <Card title="Add the tables (the easy way)">
            <Steps
              items={[
                "Click <b>Draw tables</b>.",
                { text: "<b>Click inside a table</b> on the picture. Its shape, size and number are copied and the table is added right there.", tip: "Works with round, square and rectangle tables, standing up or lying down." },
                "Keep clicking each table. Made a mistake? Click <b>Undo last</b>.",
                "Click <b>Done drawing</b> when you are finished.",
              ]}
            />
            <div className="mt-4">
              <Note>
                A table the picture doesn&apos;t show clearly? Pick a shape (Round, Square, Rectangle), then <b>press and drag</b> on the picture to draw it yourself.
              </Note>
            </div>
          </Card>

          <Card title="Move, resize, rename">
            <Steps
              items={[
                "<b>Move tables</b>: drag a table to its spot. Drag the blue dot at its corner to make it bigger or smaller. The <b>Shape</b> button switches round / square / rectangle. Then click <b>Save layout</b>.",
                "<b>Set entrance</b>: click it, then click the door(s) on the floor plan. On their phone, guests see a green line from the door to their table.",
                "<b>Rename a table or add a note</b>: point at the table and click the ⚙️ gear.",
                "<b>Delete one table</b>: point at it and click the 🗑️ bin.",
                "<b>New venue?</b> Click <b>New → Delete All Tables</b>, upload the new floor plan, and draw again. Your guests stay in your list.",
              ]}
            />
          </Card>

          <Card title="What you see on the plan">
            <ul className="space-y-2 text-zinc-700">
              <li>• Each table shows its <b>number</b>. Point at a table to see it big, with its guests (turn this off with <b>Zoom on hover</b>).</li>
              <li>• <b>Show picture / Hide picture</b>: show the venue drawing behind your tables, or just the tables.</li>
              <li>• <b>Show seats</b> and <b>Guest names</b>: show the numbered seats, and who sits in each.</li>
              <li>• <b>Grid / Floor plan</b> at the top switches between the plan and a simple grid of tables.</li>
            </ul>
          </Card>
        </Section>

        {/* 3 */}
        <Section id="guests" number={3} title="Add your guests">
          <Card title="Import a list from Excel (fastest)">
            <Steps
              items={[
                "Click <b>New → Import Guests</b>.",
                { text: "Choose your Excel file. The first row must have the headings <b>First Name</b> and <b>Last Name</b>.", tip: "Optional columns: <b>Table</b> (seats them right away), <b>Meal</b> (Chicken, Fish, Veg…), <b>Allergy</b> (Nuts, Gluten…) and <b>VIP</b> (put yes)." },
                "Your guests appear in the list, ready to be seated.",
              ]}
            />
          </Card>
          <Card title="Add one guest (also last minute)">
            <Steps
              items={[
                "Click <b>New → New Guest</b> and type the first and last name.",
                { text: "Optional: pick a <b>Table</b> (each shows its empty seats), tap a <b>Meal</b>, type an <b>Allergy</b>, tick <b>VIP</b>.", tip: "Table full? An extra seat is added for them." },
                "Guest standing at the desk? Tick <b>Here now: check them in</b>. Then click <b>Add Guest</b>.",
              ]}
            />
          </Card>
          <Card title="Add meals, allergies or VIP later (from Excel)">
            <Steps
              items={[
                "Click <b>New → Import Guests</b>, then the <b>Update meals / allergies</b> tab.",
                { text: "Choose an Excel file with <b>First Name</b>, <b>Last Name</b> and any of <b>Meal</b>, <b>Allergy</b>, <b>VIP</b>.", tip: "Guests are found by name (accents don't matter). Nobody is added twice, and empty cells change nothing." },
                "Names that are not on your list are shown, so you can fix the spelling or add them.",
              ]}
            />
          </Card>
          <Card title="A note for the desk (guest sees no seat until the desk says yes)">
            <Steps
              items={[
                { text: "Add a <b>Note</b> column to your Excel (or type a note in <b>New Guest</b>, or click 📝 next to the guest on the table card).", tip: "You can still seat the guest at a table as usual." },
                "On their phone, that guest does <b>not</b> see a seat: they are asked to see the front desk.",
                "At the desk, searching their name in Guest Names shows the note with <b>Give them their seat and check them in? Yes / No</b>. Ticking their box asks the same.",
                { text: "Before <b>Yes</b>, the desk must write a <b>Desk note</b>: type what happened (e.g. paid $250 by Zelle), or tap <b>None</b>. Then <b>Yes</b> checks them in. <b>No</b> leaves them waiting.", tip: "The desk note, who wrote it and when are in the Excel report (Seating chart → After-event report) and on the Door list." },
                "To remove a note, click 📝 next to the guest on the table card and clear it.",
              ]}
            />
          </Card>
          <Card title="Meals, allergies and VIP one by one">
            <ul className="space-y-2 text-zinc-700">
              <li>• Point at a table (menu showing). Next to each guest: the <b>★</b> (VIP), a <b>Meal</b> box and an <b>Allergy</b> box (red when filled in). Press Enter to save.</li>
              <li>• <b>★ Make the whole table VIP</b> at the top of the list stars everyone at once, and the table gets a gold <b>★ VIP</b> badge on the plan.</li>
            </ul>
          </Card>
        </Section>

        {/* 4 */}
        <Section
          id="seat"
          number={4}
          title="Seat your guests"
          intro="Do this with the menu showing (not in full screen). Guest names are always sorted by last name."
        >
          <Card title="From the table (point at it)">
            <Steps
              items={[
                "Point at a table on the floor plan. A card opens with the table and who sits there.",
                "Under <b>Add guests to this table</b>, type a name or scroll, and <b>tick</b> each guest (only guests without a seat are listed).",
                "Click <b>Seat N guests</b>. They take the empty seats in order.",
                "Wrong person? Click the <b>×</b> next to their name. They go back to your guest list.",
              ]}
            />
          </Card>
          <Card title="Fill a whole table at once">
            <Steps
              items={[
                "Open the menu (☰) and click <b>Assign Multiple</b>.",
                "On the right, pick a table (for example <i>Table 1, 10 of 10 seats available</i>).",
                { text: "Click <b>Select 10 guests for this table</b>. The next guests in the list are ticked for you.", tip: "Type in the search box first to pick from a group (a family name, for example). You can untick anyone." },
                "Click <b>Assign … to Table 1</b>, under the table list.",
              ]}
            />
          </Card>
          <Card title="One guest, one seat">
            <Steps items={["Click a seat number on a table.", "Choose the guest and confirm."]} />
          </Card>
        </Section>

        {/* 5 */}
        <Section
          id="day"
          number={5}
          title="Event day: check-in"
          intro="Guests can check themselves in on their phones, or your staff can tick them at the desk. Either way, the name pops out of the table and moves into the Arrived list."
        >
          <Card title="Put the dashboard in full screen">
            <Steps
              items={[
                "Click <b>Hide menu</b> (or <b>Full Screen</b>). Only the floor plan, the totals, <b>Arrived</b> on the left and <b>Guest Names</b> on the right stay on screen.",
                "To get the buttons back, move the mouse to the far left edge. Press <b>Esc</b> to leave full screen.",
              ]}
            />
          </Card>
          <Card title="Guests check in on their phone (QR code)">
            <Steps
              items={[
                "Print the Seating4U QR code and place it at the entrance. It opens <b>www.seating4u.com/seat-scanning</b>.",
                "The guest types their name, taps it, then taps <b>Arrived</b>. Their table is shown.",
                { text: "They are asked <b>“Arrived with more guests?”</b>. <b>Yes</b>: they search and tick each person with them, then tap <b>Done</b> to see everyone’s table. <b>No</b>: they just see their own table.", tip: "Works on any phone, no app or login needed." },
              ]}
            />
          </Card>
          <Card title="Check guests in at the desk">
            <Steps
              items={[
                "In <b>Guest Names</b> (right), find the guest: type a name or table in the search box.",
                "Tick the <b>box</b> next to the name. Only the box checks a guest in; clicking the name does nothing.",
                "The name pops out of the table on the plan and moves to <b>Arrived</b> on the left (sorted by table). It leaves Guest Names.",
              ]}
            />
            <div className="mt-4">
              <Note>
                In full screen you can also point at a table: the card lists who hasn&apos;t arrived yet, with their meal and allergy. Tick the box next to each guest as they come in, or click <b>Whole table arrived</b> when a family walks in together.
              </Note>
            </div>
          </Card>
        </Section>

        <Section id="extras" number={6} title="Event day extras">
          <Card title="Make the night shine">
            <ul className="space-y-2 text-zinc-700">
              <li>• <b>Welcome</b>: in full screen the dashboard shows &quot;Welcome to&quot; your event, and each arriving guest pops up with &quot;🎉 Welcome, Name!&quot; and their table.</li>
              <li>• <b>Arrival sound</b>: a soft chime for each arrival (a special one for VIPs). Turn it on/off with <b>Arrival sound</b>.</li>
              <li>• <b>Flashing &amp; gold tables</b>: a table&apos;s number flashes when a guest arrives; when everyone at a table is in, it turns gold with a ✓.</li>
              <li>• <b>VIP alerts</b>: point at a table and click the ★ next to a guest. When a VIP arrives, a gold banner appears on the dashboard.</li>
              <li>• <b>Meals</b>: type a meal next to each guest (point at the table). Each table shows its meal counts, and the seating chart and report include them for the caterer.</li>
              <li>• <b>Arrival bar</b>: shows how many guests are in, e.g. 112 of 150 (75%).</li>
              <li>• <b>Languages</b>: guests can switch the phone check-in page to Español, Français or Kreyòl.</li>
            </ul>
          </Card>
        </Section>

        {/* 6 */}
        <Section id="fix" number={7} title="Fixing mistakes">
          <Card title="Someone was checked in by accident">
            <Steps
              items={[
                "They are not in Guest Names anymore, so type their name in the <b>Guest Names</b> search box.",
                "A small green note shows, for example <b>✓ David Cohen arrived · Table 9</b>. That also tells your staff where they sit.",
                "Click <b>undo</b> on the note to put them back on the list as not arrived.",
              ]}
            />
          </Card>
          <Card title="Other quick fixes">
            <ul className="space-y-2 text-zinc-700">
              <li>• <b>Guest at the wrong table</b>: point at the table, click <b>×</b> next to their name, then seat them at the right table.</li>
              <li>• <b>Wrong floor plan picture</b>: upload the right one with <b>FLOOR MAP</b>. Your tables stay.</li>
              <li>• <b>Table added by mistake</b> while drawing: <b>Undo last</b>, or point at it later and click 🗑️.</li>
              <li>• <b>Screen looks old</b>: press <b>Ctrl + Shift + R</b> to reload.</li>
              <li>• <b>Two tables on the same spot</b>: a red note on the plan names them. Click <b>Move tables</b>, drag one to its real spot, then <b>Save layout</b>.</li>
              <li>• <b>Searching without accents</b> works: <i>Nadege</i> finds Nadège, <i>Fils Aime</i> finds Fils-Aimé.</li>
            </ul>
          </Card>
        </Section>

        <Section id="team" number={8} title="Ready check, staff & kitchen">
          <Card title="Ready check (the night before)">
            <Steps
              items={[
                "Open the menu (☰) and click <b>Ready check</b>.",
                "It lists anything that could go wrong at the door: tables on top of each other, guests on the list twice, guests without a table or meal, empty tables, no entrance set.",
                "Each problem says how to fix it. Click <b>Check again</b> until it says <b>All set</b>.",
              ]}
            />
          </Card>
          <Card title="Door list (paper backup)">
            <Steps
              items={[
                "Menu (☰) → <b>Door list (print)</b>: every guest A–Z with table, seat, VIP, meal and allergy, and a box to tick.",
                "Click <b>Print door list</b> the morning of the event. If the Wi-Fi or a laptop fails, the desk keeps going on paper.",
              ]}
            />
          </Card>
          <Card title="Check-in only accounts for your staff">
            <Steps
              items={[
                "Log in as <b>admin</b>, open the menu (☰) → <b>Manage Users</b>.",
                "Create the account with <b>Check-in only (staff)</b> ticked, or click <b>Full access</b> next to an existing account to switch it.",
                { text: "Staff can check guests in, add a last-minute guest and set meals, allergies and VIP. They cannot delete anything or change tables, the floor plan or the guest list import.", tip: "A change takes effect the next time that person logs in." },
              ]}
            />
          </Card>
          <Card title="Guests only find seats for the right event">
            <ul className="space-y-2 text-zinc-700">
              <li>• Each event&apos;s own QR code only searches that event.</li>
              <li>• Once an event&apos;s <b>date has passed</b>, guests can no longer look up seats in it on their phone (your dashboard and reports are not affected).</li>
              <li>• The general Seating4U QR code only searches events that are still open.</li>
              <li>• Click the event name at the top: each event shows <b>Guest check-in: Open / Closed</b>. Click it to close an event early or reopen it.</li>
              <li>• Give every event a <b>date</b> so it closes by itself (the Ready check reminds you).</li>
            </ul>
          </Card>
          <Card title="Kitchen screen for the caterer">
            <Steps
              items={[
                "Menu (☰) → <b>Kitchen screen</b> on a tablet or TV in the kitchen (log in with a staff account).",
                "It shows the meals to serve now for guests who have <b>arrived</b>, table by table, with allergies in red, plus what is still expected. It updates by itself.",
              ]}
            />
          </Card>
        </Section>

        {/* Tips */}
        <section className="mb-16">
          <h2 className="mb-6 border-b border-zinc-200 pb-3 text-2xl font-light text-black">Tips</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="mb-3 font-semibold text-black">Before the event</h3>
              <ul className="space-y-2 text-sm text-zinc-600">
                <li>• Set up the tables first, then seat guests.</li>
                <li>• Do a practice run: check in 2–3 test guests on a phone and watch them appear in Arrived.</li>
                <li>• Run the <b>Ready check</b> and print the <b>Door list</b> the night before.</li>
                <li>• Give your desk helpers <b>check-in only</b> accounts.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="mb-3 font-semibold text-black">On the day</h3>
              <ul className="space-y-2 text-sm text-zinc-600">
                <li>• Put the dashboard in full screen on a big screen at the desk.</li>
                <li>• Place the QR code where guests line up.</li>
                <li>• Keep a second device logged in, just in case.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Support */}
        <section className="border-t border-zinc-200 pt-12 text-center">
          <h2 className="mb-4 text-2xl font-light text-black">Need more help?</h2>
          <p className="mb-6 text-zinc-600">We&apos;re happy to help you get set up.</p>
          <a href="tel:417-893-0047" className="inline-block bg-lime-500 px-8 py-3 font-medium text-white transition-colors hover:bg-lime-600">
            Call support: 417-893-0047
          </a>
        </section>
      </div>
    </div>
  );
}
