import { authOptions } from "@/lib/auth.config";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { staffIds } from "@/lib/roles";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.email !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const users = await prisma.user.findMany({
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
