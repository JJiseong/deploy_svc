"use client";
import { signOut } from "next-auth/react";
export function SignOutButton() { return <button type="button" className="button text sign-out" onClick={() => signOut({ callbackUrl: "/login" })}>로그아웃</button>; }
