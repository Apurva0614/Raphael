import { useState } from "react";

// Crosshair locate icon — circle, center dot, N/E/S/W ticks.
function LocateIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="1.2" fill={color} stroke="none" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
    </svg>
  );
}

export function LocateButton({
  onClick,
  style,
  title = "Recenter",
}: {
  onClick: () => void;
  style?: React.CSSProperties;
  title?: string;
}) {
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);
  const handle = () => {
    setActive(true);
    onClick();
    window.setTimeout(() => setActive(false), 1200);
  };
  const borderColor = active || hover ? "#9aa961" : "#1e2d1e";
  const bg = active ? "#9aa96122" : "#0d150d";
  const color = active ? "#9aa961" : "var(--cream)";
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={handle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 32,
        height: 32,
        background: bg,
        border: `1px solid ${borderColor}`,
        color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "border-color .15s, background .15s, color .15s",
        ...style,
      }}
    >
      <LocateIcon />
    </button>
  );
}

export default LocateButton;
