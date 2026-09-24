import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "USER";
      status: "ACTIVE" | "INACTIVE";
    } & DefaultSession["user"];
  }
}
