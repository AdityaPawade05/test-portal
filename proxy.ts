import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const CANDIDATE_PREFIX = "/candidate/dashboard";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }
  const isCandidateRoute = pathname.startsWith(CANDIDATE_PREFIX);
  const requiredKind = isCandidateRoute ? "candidate" : "admin";
  const loginPath = isCandidateRoute ? "/candidate/login" : "/login";

  if (req.auth?.user?.kind !== requiredKind) {
    const loginUrl = new URL(loginPath, req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/banks",
    "/banks/:path*",
    "/tests",
    "/tests/:path*",
    "/invitations",
    "/invitations/:path*",
    "/candidate/dashboard",
    "/candidate/dashboard/:path*",
  ],
};
