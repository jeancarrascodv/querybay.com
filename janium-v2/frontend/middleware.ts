import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Routes that don't require authentication
 */
const PUBLIC_ROUTES = [
  "/sign-up",
  "/sign-up/",
  "/sign-up/*",
  "/sign-in",
  "/api/auth", // All auth API routes are public
];

/**
 * Check if pathname is a public route
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Check if user has valid authentication token
 * Simple check: if token exists, allow access
 * Backend will return 401 if token is invalid/expired
 */
function hasAuthToken(request: NextRequest): boolean {
  // Check for backend HttpOnly cookie

  const backendCookie = request.cookies.get("janium_auth_token");
  console.log("Backend cookie:", backendCookie);
  if (backendCookie?.value) {
    return true;
  }

  // Check for client-side cookie (set by auth-client)
  const clientCookie = request.cookies.get("janium_client_token");
  console.log("Client cookie:", clientCookie);
  if (clientCookie?.value) {
    return true;
  }

  return false;
}

/**
 * Next.js middleware - validates authentication for protected routes
 * Simple approach: if user has a token, allow all pages
 * Backend will return 401 if token is invalid/expired
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth check for static files, API routes, and browser-specific paths
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/.well-known") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // Allow public routes
  if (isPublicRoute(pathname) || pathname.startsWith("/sign-up/")) {
    return NextResponse.next();
  }

  // For all other routes, check if user has auth token
  const authenticated = hasAuthToken(request);
  console.log(
    `Middleware: ${authenticated ? "Authenticated" : "Not Authenticated"} for ${pathname}`
  );

  // For root path, redirect to teams if authenticated
  if (pathname === "/") {
    if (authenticated) {
      return NextResponse.redirect(new URL("/integrations", request.url));
    }
    return NextResponse.next();
  }

  // If not authenticated, redirect to sign-in
  if (!authenticated) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // If authenticated, allow access to all routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
