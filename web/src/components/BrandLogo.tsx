export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-logo ${className}`.trim()}>
      <span className="brand-logo__mark" aria-hidden="true"><img src="/husaini-tech-solutions.png" alt="" decoding="async" draggable={false} /></span>
      <span className="brand-logo__text"><strong>repairTrack</strong><span>by Husaini Tech Solutions</span></span>
    </span>
  );
}
