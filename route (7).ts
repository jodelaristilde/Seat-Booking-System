import { authOptions } from "@/lib/auth.config";
import { hashPassword } from "@/lib/password";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Only the very first account can be created without logging in
    // (so a brand-new site can get its "admin" account).
    // After that, only the logged-in "admin" can create accounts.
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      const session = await getServerSession(authOptions);
      if (session?.user?.email !== "admin") {
        return new NextResponse("Unauthorized", { status: 401 });
      }
    }

    const user = await prisma.user.create({
      data: {
        email,
        password: await hashPassword(password),
        name,
      },
    });

    // Never send the password back
    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    console.log(error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
