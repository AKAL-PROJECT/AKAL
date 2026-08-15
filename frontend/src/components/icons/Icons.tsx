// IcÃ´nes SVG inline â€” aucune dÃ©pendance externe.
// Si tu installes lucide-react plus tard, tu peux remplacer ces composants
// par les imports correspondants (Search, MapPin, Heart, etc.).

type IconProps = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
};

// Trait 1.75 par dÃ©faut (signature graphique du set) â€” les appels qui
// prÃ©cisent dÃ©jÃ  strokeWidth (ex. connexion, gros pictos) restent inchangÃ©s.
function base(size = 16, strokeWidth = 1.75): React.SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
}

export function Search({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function MapPin({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function Heart({ size, className, style, strokeWidth, fill = "none" }: IconProps & { fill?: string }) {
  return (
    <svg {...base(size, strokeWidth)} fill={fill} className={className} style={style}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
    </svg>
  );
}

export function Droplets({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 4.8 7 3c-.29 1.8-1.14 3.13-2.29 4.06S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05Z" />
      <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
    </svg>
  );
}

export function Grid({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

export function Map({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0Z" />
      <path d="M15 5.764v15" />
      <path d="M9 3.236v15" />
    </svg>
  );
}

export function Filter({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function X({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function ArrowRight({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function BarChart({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <line x1="12" x2="12" y1="20" y2="10" />
      <line x1="18" x2="18" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="16" />
    </svg>
  );
}

export function MessageSquare({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function Phone({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.4h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

export function Share2({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
      <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
    </svg>
  );
}

export function FileText({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

export function ChevronLeft({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRight({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function Ruler({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" />
      <path d="m14.5 12.5 2-2" /><path d="m11.5 9.5 2-2" />
      <path d="m8.5 6.5 2-2" /><path d="m17.5 15.5 2-2" />
    </svg>
  );
}

export function Leaf({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

export function Shield({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
    </svg>
  );
}

export function TrendingUp({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

export function Check({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function ChevronDown({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Images({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}

export function User({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function Menu({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export function Mail({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function Lock({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function Eye({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOff({ size, className, style, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className} style={style}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

// Illustration ligne-art (montagne/triangle) â€” Ã©tat vide du catalogue.
// Aucune dÃ©pendance externe, cohÃ©rente avec le reste des icÃ´nes inline.
export function MountainEmpty({ size = 64, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d="M6 46 22 20l10 14 6-8 20 20" />
    </svg>
  );
}

