export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-logo ${className}`.trim()}>
      <img className="brand-logo__image" src="/husaini-tech-solutions.png" alt="Husaini Tech Solutions. Innovate, solve, empower." width={1024} height={1024} decoding="async" draggable={false} />
      <span className="brand-logo__text"><strong>RepairTrack</strong><span>by Husaini Tech Solutions</span></span>
    </span>
  );
}
