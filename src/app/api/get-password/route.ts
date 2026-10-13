export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"

// This route used to send a person's password to the browser.
// It is no longer used by the site and has been switched off.
export async function GET() {
  return NextResponse.json(
    { success: false, message: "This feature has been removed" },
    { status: 410 },
  )
}
