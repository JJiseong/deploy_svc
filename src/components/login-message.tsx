"use client";

import { useSearchParams } from "next/navigation";

const messages: Record<string, string> = {
  AccessDenied: "이 GitHub 계정에는 접근 권한이 없습니다. 관리자에게 문의하세요.",
  Configuration: "GitHub 로그인을 사용할 수 없습니다. 다시 시도하세요.",
  OAuthSignin: "GitHub 로그인을 사용할 수 없습니다. 다시 시도하세요.",
  OAuthCallback: "GitHub 로그인을 사용할 수 없습니다. 다시 시도하세요.",
  Callback: "GitHub 로그인을 사용할 수 없습니다. 다시 시도하세요.",
};

export function LoginMessage() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  return <div className="alert error" role="alert"><p>{messages[error] ?? "GitHub 로그인을 사용할 수 없습니다. 다시 시도하세요."}</p><a className="button secondary" href="/login">다시 시도</a></div>;
}
