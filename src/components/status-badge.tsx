const labels: Record<string, string> = { REQUESTED: "요청됨", PROVISIONING: "준비 중", QUEUED: "대기 중", IN_PROGRESS: "진행 중", HEALTHY: "정상", FAILED: "실패", CANCELLED: "취소됨", UNKNOWN: "확인 불가" };
const icons: Record<string, string> = { REQUESTED: "○", PROVISIONING: "◌", QUEUED: "◷", IN_PROGRESS: "↻", HEALTHY: "✓", FAILED: "!", CANCELLED: "×", UNKNOWN: "?" };
export function StatusBadge({ status }: { status: string }) {
  const tone = status.toLowerCase().replace("_", "-");
  return <span className={`status-badge status-${tone}`}><span aria-hidden="true">{icons[status] ?? "•"}</span><span>{labels[status] ?? status}</span></span>;
}
