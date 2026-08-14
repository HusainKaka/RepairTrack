export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-logo ${className}`.trim()} role="img" aria-label="RepairTrack">
      <img src="/repairtrack-logo.png" alt="" decoding="async" draggable={false} />
    </span>
  );
}
