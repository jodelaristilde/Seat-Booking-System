// Seating helpers shared by the server and the pages (no database here).
// - Rules: two guests who must sit together, or must not sit at the same table.
// - planSeating: seat everyone without a seat, keeping parties, families and
//   "together" guests at one table and "apart" guests at different tables.

export type RuleKind = "together" | "apart";
export type Rule = { id: string; a: string; b: string; kind: RuleKind };

export type PlanGuest = { id: string; firstname: string; lastname: string; tableId: string | null };
export type PlanTable = { id: string; name: string; free: number; seats: number };

export type PlanResult = {
  moves: { guestId: string; tableId: string }[]; // new seats to give
  groups: { names: string[]; tables: string[]; split: boolean }[]; // groups of 2+ kept together (or split)
  notSeated: string[]; // guest ids with no room left
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Rules broken by the current seating
export function ruleProblems(
  rules: Rule[],
  tableOf: (guestId: string) => string | null,
  nameOf: (guestId: string) => string,
  tableName: (tableId: string) => string
): { rule: Rule; text: string }[] {
  const out: { rule: Rule; text: string }[] = [];
  for (const r of rules) {
    const ta = tableOf(r.a);
    const tb = tableOf(r.b);
    if (r.kind === "apart" && ta && ta === tb)
      out.push({ rule: r, text: `${nameOf(r.a)} and ${nameOf(r.b)} should not sit together, but both are at ${tableName(ta)}.` });
    if (r.kind === "together" && ta && tb && ta !== tb)
      out.push({
        rule: r,
        text: `${nameOf(r.a)} (${tableName(ta)}) and ${nameOf(r.b)} (${tableName(tb)}) should sit at the same table.`,
      });
  }
  return out;
}

export function planSeating(
  guests: PlanGuest[],
  tables: PlanTable[],
  rules: Rule[],
  parties: Record<string, string[]>,
  opts: { families: boolean }
): PlanResult {
  const byId = new Map(guests.map((g) => [g.id, g]));
  const free = new Map(tables.map((t) => [t.id, t.free]));
  const tableName = new Map(tables.map((t) => [t.id, t.name]));
  const seatedAt = new Map<string, string>(); // guest -> table (now, plus planned)
  for (const g of guests) if (g.tableId) seatedAt.set(g.id, g.tableId);

  // ---- groups: union-find over parties, "together" rules and (optionally) last names
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(x, p);
    return p;
  };
  const join = (a: string, b: string) => {
    if (!byId.has(a) || !byId.has(b)) return;
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const [leader, ids] of Object.entries(parties)) for (const id of ids) join(leader, id);
  for (const r of rules) if (r.kind === "together") join(r.a, r.b);
  if (opts.families) {
    // same last name = same family (seated guests never move: they just give
    // their family a table to join)
    const byLast = new Map<string, string>();
    for (const g of guests) {
      const k = fold(g.lastname).replace(/\s*\+\d+$/, "");
      if (!k) continue;
      const first = byLast.get(k);
      if (first) join(first, g.id);
      else byLast.set(k, g.id);
    }
  }
  const groupsMap = new Map<string, string[]>();
  for (const g of guests) {
    const r = find(g.id);
    groupsMap.set(r, [...(groupsMap.get(r) ?? []), g.id]);
  }

  const apart = new Map<string, Set<string>>();
  for (const r of rules)
    if (r.kind === "apart") {
      apart.set(r.a, (apart.get(r.a) ?? new Set()).add(r.b));
      apart.set(r.b, (apart.get(r.b) ?? new Set()).add(r.a));
    }
  // who sits (or will sit) at each table
  const atTable = new Map<string, Set<string>>();
  for (const [g, t] of seatedAt) atTable.set(t, (atTable.get(t) ?? new Set()).add(g));
  const clashes = (members: string[], tableId: string) => {
    const there = atTable.get(tableId) ?? new Set();
    return members.some((m) => [...(apart.get(m) ?? [])].some((x) => there.has(x)));
  };

  const moves: PlanResult["moves"] = [];
  const notSeated: string[] = [];
  const groups: PlanResult["groups"] = [];
  const place = (gid: string, tid: string) => {
    moves.push({ guestId: gid, tableId: tid });
    seatedAt.set(gid, tid);
    atTable.set(tid, (atTable.get(tid) ?? new Set()).add(gid));
    free.set(tid, (free.get(tid) ?? 0) - 1);
  };
  const order = (a: string, b: string) => (tableName.get(a) ?? "").localeCompare(tableName.get(b) ?? "", undefined, { numeric: true });

  // groups joining someone already seated go first (their table is waiting),
  // then the biggest groups: they are hardest to fit
  const list = [...groupsMap.values()]
    .map((members) => ({ members, todo: members.filter((m) => !seatedAt.has(m)), home: members.some((m) => seatedAt.has(m)) }))
    .filter((g) => g.todo.length > 0)
    .sort((a, b) => Number(b.home) - Number(a.home) || b.todo.length - a.todo.length);

  for (const g of list) {
    const todo = g.todo;
    // a member already seated: try their table first
    const home = g.members.map((m) => seatedAt.get(m)).find((t) => t);
    const fits = (tid: string, n: number) => (free.get(tid) ?? 0) >= n && !clashes(todo, tid);
    let tid: string | undefined;
    if (home && fits(home, todo.length)) tid = home;
    if (!tid) {
      // the table where the group fits most snugly (keeps big tables for big groups)
      tid = [...free.keys()]
        .filter((t) => fits(t, todo.length))
        .sort((a, b) => (free.get(a)! - free.get(b)!) || order(a, b))[0];
    }
    if (tid) {
      for (const m of todo) place(m, tid);
      if (g.members.length > 1)
        groups.push({ names: g.members.map((m) => `${byId.get(m)!.firstname} ${byId.get(m)!.lastname}`), tables: [tableName.get(tid)!], split: false });
      continue;
    }
    // no single table has room: fill the emptiest tables one guest at a time
    const used = new Set<string>();
    for (const m of todo) {
      const t = [...free.keys()]
        .filter((x) => (free.get(x) ?? 0) > 0 && !clashes([m], x))
        .sort((a, b) => Number(used.has(b)) - Number(used.has(a)) || free.get(b)! - free.get(a)! || order(a, b))[0];
      if (!t) {
        notSeated.push(m);
        continue;
      }
      used.add(t);
      place(m, t);
    }
    if (g.members.length > 1)
      groups.push({
        names: g.members.map((m) => `${byId.get(m)!.firstname} ${byId.get(m)!.lastname}`),
        tables: [...used].map((t) => tableName.get(t)!),
        split: used.size > 1,
      });
  }
  return { moves, groups, notSeated };
}
