export function TopoBackground({ opacity = 0.06 }: { opacity?: number }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      style={{ opacity, color: "#c8b89a" }}
    >
      <g fill="none" stroke="currentColor" strokeWidth="0.7">
        {Array.from({ length: 14 }).map((_, i) => (
          <path
            key={`l-${i}`}
            d={`M -100 ${450 + Math.sin(i) * 30} Q 400 ${450 - (80 + i * 55) * 0.6} 800 ${
              450 + Math.cos(i) * 40
            } T 1700 ${450 + Math.sin(i * 1.3) * 50}`}
          />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <ellipse
            key={`e-${i}`}
            cx={300 + i * 30}
            cy={600 + i * 8}
            rx={400 + i * 40}
            ry={120 + i * 18}
            opacity={0.6}
          />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <ellipse
            key={`r-${i}`}
            cx={1250 - i * 20}
            cy={320 - i * 6}
            rx={260 + i * 30}
            ry={90 + i * 14}
            opacity={0.5}
          />
        ))}
      </g>
    </svg>
  );
}

export default TopoBackground;
