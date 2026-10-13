import { PrismaClient } from "@prisma/client"
import type { NextAuthOptions } from "next-auth"
import NextAuth from "next-auth/next"
import { hashPassword, isHashed, verifyPassword } from "@/lib/password"
import CredentialsProvider from "next-auth/providers/credentials"

const prisma = new PrismaClient()

const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials")
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email,
          },
        })

        if (!user || !(await verifyPassword(credentials.password, user.password))) {
          throw new Error("Invalid credentials")
        }

        // Old plain-text accounts get upgraded to a hashed password at login
        if (!isHashed(user.password)) {
          await prisma.user.update({
            where: { id: user.id },
            data: { password: await hashPassword(credentials.password) },
          })
        }

        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user ).id = token.id
      }
      return session
    },
  },
}
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
  }
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }