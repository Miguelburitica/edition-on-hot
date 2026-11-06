import type { CSSProperties, ReactNode } from 'react';

/** Stroke icons from the design (16px grid), drawn in the current text color. */
function Icon({ size = 14, width = 1.5, children, style, className }: { size?: number; width?: number; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={width} aria-hidden="true" style={style} className={className}>
      {children}
    </svg>
  );
}

type P = { size?: number; style?: CSSProperties; className?: string };

export const SlidersIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2 4h7M12 4h2M2 12h2M7 12h7" />
    <circle cx="10.5" cy="4" r="1.5" />
    <circle cx="5.5" cy="12" r="1.5" />
  </Icon>
);
export const CloseIcon = (p: P) => (
  <Icon size={12} width={1.6} {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);
export const CursorIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 2.5l9 4.2-3.9 1.4-1.4 3.9z" strokeLinejoin="round" />
  </Icon>
);
export const UndoIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 3L2 6l3 3" />
    <path d="M2 6h7.5a3.5 3.5 0 010 7H6" />
  </Icon>
);
export const RedoIcon = (p: P) => (
  <Icon {...p}>
    <path d="M11 3l3 3-3 3" />
    <path d="M14 6H6.5a3.5 3.5 0 000 7H10" />
  </Icon>
);
export const CheckIcon = (p: P) => (
  <Icon width={1.8} {...p}>
    <path d="M3.5 8.5l3 3 6-7" />
  </Icon>
);
export const AlertIcon = (p: P) => (
  <Icon width={1.6} {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.75v3.75M8 10.75v.5" />
  </Icon>
);
export const InfoIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.5v3.5M8 5v.3" />
  </Icon>
);
export const WarnIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 2.2L14.2 13H1.8z" />
    <path d="M8 6.5v3M8 11.2v.3" />
  </Icon>
);
export const LockIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
  </Icon>
);
export const DownloadIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 2v8M4.5 7L8 10.5 11.5 7M3 13.5h10" />
  </Icon>
);
export const CopyIcon = (p: P) => (
  <Icon {...p}>
    <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
    <path d="M3 10.5V3.5a1 1 0 011-1h6.5" />
  </Icon>
);
export const ArrowIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Icon>
);
export const ChevronIcon = (p: P) => (
  <Icon size={12} width={1.6} {...p}>
    <path d="M4 6l4 4 4-4" />
  </Icon>
);
export const BranchIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 2.5v11M4 8c0-2.5 2-3.5 4-3.5h4M10 2.5l2 2-2 2" />
  </Icon>
);
