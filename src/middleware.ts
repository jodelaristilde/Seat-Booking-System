import { withAuth } from "next-auth/middleware"
import { getToken } from "next-auth/jwt"
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"

// ---------------------------------------------------------------
// PUBLIC API ROUTES
// These are the only /api routes that work WITHOUT being logged in.
// They are what guests need for the QR seat finder and the client view.
// Every other /api route now requires a login.
// ---------------------------------------------------------------
const PUBLIC_API: { path: string; methods: string[] }[] = [
  { path: "/api/auth", methods: ["GET", "POST"] }, // login itself
  { path: "/api/floor-map", methods: ["GET"] }, // guests see the floor map (upload/delete need login)
  { path: "/api/find-guest", methods: ["GET"] }, // guest name search (max 5 matches)
  { path: "/api/get-seat-checkin", methods: ["GET"] }, // guest seat lookup
  { path: "/api/get-seat", methods: ["GET"] }, // client view (names are hidden unless logged in)
  { path: "/api/seat-checkin", methods: ["POST"] }, // guest taps "I've arrived"
  { path: "/api/register", methods: ["POST"] }, // the route itself checks who is allowed
  { path: "/api/wayfind", methods: ["GET"] }, // guest phone: line from the entrance to their table (no names)
  { path: "/api/event-info", methods: ["GET"] }, // guest phone: which event this QR code is for (name only)
  { path: "/api/rsvp", methods: ["GET", "POST"] }, // a guest's own RSVP link (signed, one guest only)
  { path: "/api/live", methods: ["GET"] }, // the client's read-only live view (signed link only)
  { path: "/api/vip/guest-call", methods: ["POST"] }, // VIP guest taps "Call server" / "Order another bottle" (checked in the route)
]

// What a check-in-only ("staff") account may change. Everything else that
// changes data (deleting, tables, floor plan, imports, events, users) is refused.
const STAFF_API: { path: string; methods: string[] }[] = [
  { path: "/api/update-seat-received", methods: ["PUT"] }, // tick a guest in / undo
  { path: "/api/seat-checkin", methods: ["POST"] },
  { path: "/api/add-guest", methods: ["POST"] }, // last-minute guest
  { path: "/api/guest-update", methods: ["PUT"] }, // meal / VIP
  { path: "/api/allergies", methods: ["PUT"] },
  { path: "/api/guest-notes/answer", methods: ["POST"] }, // the desk's required answer before seating a guest with a note
  { path: "/api/events", methods: ["PUT"] }, // open another event (renaming is refused in the route)
  { path: "/api/change-password", methods: ["POST", "PUT", "PATCH"] }, // their own password
  // Nightclub VIP: servers and door staff
  { path: "/api/vip/arrive", methods: ["PUT"] }, // count people in
  { path: "/api/vip/order", methods: ["POST", "PUT"] }, // log a bottle order / mark it served
  { path: "/api/vip/call", methods: ["PUT"] }, // a guest's call handled
  { path: "/api/vip/celebrate", methods: ["PUT"] }, // presentation done
]
const staffMayChange = (path: string, method: string) =>
  STAFF_API.some((r) => (path === r.path || path.startsWith(r.path + "/")) && r.methods.includes(method))

const isPublicApi = (path: string, method: string) =>
  PUBLIC_API.some(
    (r) =>
      (path === r.path || path.startsWith(r.path + "/")) &&
      r.methods.includes(method)
  )

// The original page rules, unchanged.
const pageMiddleware = withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    // If user is logged in and tries to access pages other than the allowed ones
    if (token) {
      const allowedAuthPaths = ["/dashboard", "/client-view", "/seat-scanning", "/check-in", "/live", "/rsvp", "/user-guide"]
      if (!allowedAuthPaths.some((p) => path.startsWith(p))) {
        return NextResponse.redirect(new URL("/dashboard", req.url))
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname

        // Allow unrestricted access to seat-scanning
        if (path.startsWith("/seat-scanning")) {
          return true
        }

        // Require authentication for check-in page, but allow access to check-in/login
        if (path.startsWith("/check-in")) {
          if (path.startsWith("/check-in/login")) {
            return true
          }
          return !!token
        }

        // Only require authentication for dashboard page
        if (path.startsWith("/dashboard")) {
          return !!token
        }

        // Allow access to client-view without auth
        if (path.startsWith("/client-view")) {
          return true
        }

        return true
      },
    },
  },
)

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const path = req.nextUrl.pathname

  // --- API routes: must be public-listed, or the person must be logged in ---
  if (path.startsWith("/api/")) {
    if (isPublicApi(path, req.method)) {
      return NextResponse.next()
    }
    const token = await getToken({ req })
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Please log in first" },
        { status: 401 }
      )
    }
    if (token.role === "staff" && req.method !== "GET" && !staffMayChange(path, req.method)) {
      return NextResponse.json(
        { success: false, message: "Check-in staff accounts can't do this. Ask the event organizer." },
        { status: 403 }
      )
    }
    return NextResponse.next()
  }

  // --- Pages: same behavior as before ---
  const run = pageMiddleware as unknown as (
    req: NextRequest,
    event: NextFetchEvent
  ) => Promise<Response | undefined> | Response | undefined
  return run(req, event)
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/client-view/:path*",
    "/seat-scanning/:path*",
    "/check-in/:path*",
    "/api/:path*",
  ],
}
