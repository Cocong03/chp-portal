// Concreat ring mark (wireframe .topbar-logo-mark): four quarter arcs, rotated to match `conic-gradient(from -45deg …)`.
const SEGMENTS = ['var(--brand-blue)', 'var(--brand-ring-navy)', 'var(--brand-steel)', 'var(--brand-sky)']
const RADIUS = 11
const QUARTER = (2 * Math.PI * RADIUS) / 4

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" className="shrink-0">
      <g transform="rotate(-135 15 15)" fill="none" strokeWidth={8}>
        {SEGMENTS.map((color, i) => (
          <circle
            key={color}
            cx={15}
            cy={15}
            r={RADIUS}
            stroke={color}
            strokeDasharray={`${QUARTER} ${QUARTER * 3}`}
            strokeDashoffset={-QUARTER * i}
          />
        ))}
      </g>
    </svg>
  )
}
