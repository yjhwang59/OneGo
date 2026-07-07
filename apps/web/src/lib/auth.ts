import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

function getOtcApiBase(): string {
  const base =
    process.env.OTC_API_BASE ||
    process.env.NEXT_PUBLIC_OTC_API_BASE ||
    "http://127.0.0.1:3875";
  return base.replace(/\/+$/, "");
}

/** Call OTC API to ensure user from Google profile; returns OTC userId. */
async function ensureFromGoogle(params: {
  sub: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
}): Promise<{ userId: string; displayName: string; email?: string }> {
  const base = getOtcApiBase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secret = process.env.OTC_SERVER_SECRET;
  if (secret) headers["x-otc-server-secret"] = secret;

  const res = await fetch(`${base}/api/users/ensure-from-google`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      sub: params.sub,
      email: params.email ?? undefined,
      name: params.name ?? undefined,
      picture: params.picture ?? undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OTC ensure-from-google failed: ${res.status} ${err}`);
  }
  return res.json() as Promise<{ userId: string; displayName: string; email?: string }>;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    displayName?: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.provider === "google" && user && account.providerAccountId) {
        const otc = await ensureFromGoogle({
          sub: account.providerAccountId,
          email: user.email ?? null,
          name: user.name ?? null,
          picture: user.image ?? null,
        });
        token.userId = otc.userId;
        token.displayName = otc.displayName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId ?? (token.sub as string);
        if (token.displayName) session.user.name = token.displayName;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};
