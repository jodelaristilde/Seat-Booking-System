import { authOptions } from "@/lib/auth.config";
import { hashPassword } from "@/lib/password";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { roleOf, setStaff, setStaffOwner } from "@/lib/roles";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, staff } = body;

    if (!email || !password) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Only the very first account can be created without logging in
    // (so a brand-new site can get its "admin" account).
    // After that, only the logged-in "admin" can create accounts.
    // A regular (full) user may create CHECK-IN STAFF accounts for their own event.
    const userCount = await prisma.user.count();
    let ownerId: string | null = null;
    if (userCount > 0) {
      const session = await getServerSession(authOptions);
      if (session?.user?.email !== "admin") {
        const me = session?.user?.id;
        if (!me || (await roleOf(me)) === "staff" || staff !== true) {
          return new NextResponse("Unauthorized", { status: 401 });
        }
        ownerId = me;
      }
    }
    if (String(email).trim().toLowerCase() === "admin" && userCount > 0) {
      return new NextResponse("That username is taken", { status: 409 });
    }
    if (await prisma.user.findUnique({ where: { email } })) {
      return new NextResponse("That username is taken", { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        password: await hashPassword(password),
        name,
      },
    });

    if (staff === true) await setStaff(user.id, true);
    if (ownerId) await setStaffOwner(user.id, ownerId);

    // Never send the password back
    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    console.log(error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
