import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { isEmailAllowed } from "@/lib/auth-config";

const nextAuth = NextAuth({
  debug: process.env.AUTH_DEBUG === "true",
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google,
    Credentials({
      id: "magic-link",
      name: "Magic Link",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        const token =
          typeof credentials?.token === "string" ? credentials.token : null;

        if (!token) {
          return null;
        }

        const { verifyMagicLoginToken } = await import("@/lib/magic-token");
        const payload = verifyMagicLoginToken(token, { consume: true });

        if (!payload) {
          return null;
        }

        return {
          id: `magic-link:${payload.email}`,
          email: payload.email,
          name: payload.email,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  callbacks: {
    signIn({ profile, user }) {
      const email = user.email ?? getProfileEmail(profile);

      if (!isEmailAllowed(email)) {
        return "/login?error=AccessDenied";
      }

      return true;
    },
  },
});

export const { handlers, auth, signIn, signOut } = nextAuth;
export const { GET, POST } = handlers;

function getProfileEmail(profile: unknown) {
  if (!profile || typeof profile !== "object" || !("email" in profile)) {
    return null;
  }

  const email = profile.email;

  return typeof email === "string" ? email : null;
}
