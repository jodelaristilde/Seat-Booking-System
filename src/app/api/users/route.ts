import { authOptions } from "@/lib/auth.config";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { roleOf, staffIds, teamOf, teamStaff } from "@/lib/roles";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    const isAdmin = session?.user?.email === "admin";
    const me = session?.user?.id;
    if (!isAdmin && (!me || (await roleOf(me)) === "staff")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    // everyone else only sees their team's check-in staff
    const mine = isAdmin ? null : await teamStaff(await teamOf(me!));

    const users = await prisma.user.findMany({
      ...(mine ? { where: { id: { in: [...mine] } } } : {}),
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    const staff = await staffIds();
    return NextResponse.json(users.map((u: { id: string }) => ({ ...u, staff: staff.has(u.id) })));
  } catch {
    return new NextResponse("Internal error", { status: 500 });
  }
}
