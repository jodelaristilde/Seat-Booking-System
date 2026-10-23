import { authOptions } from "@/lib/auth.config"
import { hashPassword } from "@/lib/password"
import { mayManage } from "@/lib/roles"
import { PrismaClient } from "@prisma/client"
import { getServerSession } from "next-auth"
import { type NextRequest, NextResponse } from "next/server"

const prisma = new PrismaClient()

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("id")

    if (!userId) {
      return new NextResponse("User ID is required", { status: 400 })
    }

    // admin: any account; a regular user: only the check-in staff they created
    if (!(await mayManage(session, userId))) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const target = await prisma.user.findUnique({ where: { id: userId } })
    if (target?.email === "admin") {
      return new NextResponse("The admin account cannot be deleted", { status: 400 })
    }

    await prisma.user.delete({
      where: {
        id: userId,
      },
    })

    return new NextResponse(null, { status: 204 })
  } catch {
    return new NextResponse("Internal error", { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("id")

    if (!userId) {
      return new NextResponse("User ID is required", { status: 400 })
    }

    // admin: any account; a regular user: only the check-in staff they created
    if (!(await mayManage(session, userId))) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const body = await request.json()
    const { password } = body

    if (typeof password !== "string" || password.length < 6) {
      return new NextResponse("Password must be at least 6 characters", { status: 400 })
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: await hashPassword(password),
      },
    })

    return NextResponse.json({ id: updatedUser.id, email: updatedUser.email, name: updatedUser.name })
  } catch {
    return new NextResponse("Internal error", { status: 500 })
  }
}
