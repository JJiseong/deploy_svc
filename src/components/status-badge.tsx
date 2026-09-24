const labels: Record<string, string> = { REQUESTED: "Requested", PROVISIONING: "Provisioning", QUEUED: "Queued", IN_PROGRESS: "In progress", HEALTHY: "Healthy", FAILED: "Failed", CANCELLED: "Cancelled", UNKNOWN: "Unknown" };
const icons: Record<string, string> = { REQUESTED: "○", PROVISIONING: "◌", QUEUED: "◷", IN_PROGRESS: "↻", HEALTHY: "✓", FAILED: "!", CANCELLED: "×", UNKNOWN: "?" };
export function StatusBadge({ status }: { status: string }) {
  const tone = status.toLowerCase().replace("_", "-");
  return <span className={`status-badge status-${tone}`}><span aria-hidden="true">{icons[status] ?? "•"}</span><span>{labels[status] ?? status}</span></span>;
}
