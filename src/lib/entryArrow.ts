// Which way you walk in through a door on the floor plan: away from the
// nearest wall (edge of the plan), into the room. Degrees for an arrow that
// points right when not rotated (0 = right, 90 = down, 180 = left, 270 = up).
export function entryAngle(pt: { x: number; y: number; dir?: number }): number {
  if (pt.dir !== undefined && [0, 90, 180, 270].includes(pt.dir)) return pt.dir;
  const d = [
    { a: 0, v: pt.x }, // door on the left wall: walk right
    { a: 180, v: 100 - pt.x }, // right wall: walk left
    { a: 90, v: pt.y }, // top wall: walk down
    { a: 270, v: 100 - pt.y }, // bottom wall: walk up
  ];
  return d.sort((p, q) => p.v - q.v)[0].a;
}
