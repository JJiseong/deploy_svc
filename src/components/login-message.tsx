"use client";

import { useSearchParams } from "next/navigation";

const messages: Record<string, string> = {
  CredentialsSignin: "이메일 또는 비밀번호를 확인하세요.",
  AccessDenied: "이 계정은 사용할 수 없습니다. 관리자에게 문의하세요.",
  Configuration: "로그인 설정을 확인할 수 없습니다. 관리자에게 문의하세요.",
};

export function LoginMessage() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  return <div className="alert error" role="alert"><p>{messages[error] ?? "로그인에 실패했습니다. 다시 시도하세요."}</p><a className="button secondary" href="/login">다시 시도</a></div>;
}
