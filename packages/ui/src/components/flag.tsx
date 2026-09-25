import { type SVGAttributes } from 'react';
import { cn } from '../lib/cn';

// Country flags (Baseline §Icons and flags): inline SVG symbols, not emoji — no emoji font in
// headless test environments, a letter-pair fallback on some Windows Chrome installs, and wide
// glyphs break line wrapping. 15x10px, radius 2, hairline inset shadow (13x9 inside badges).
// Simplified designs exist for the countries below only; languages never get flags.
export const FLAG_CODES = [
  'AUT',
  'POL',
  'ROU',
  'SVK',
  'POR',
  'TUR',
  'ITA',
  'CZE',
  'CHN',
  'AUS',
  'SUI',
  'GER',
  'ESP',
  'USA',
  'FRA',
] as const;

export type FlagCode = (typeof FLAG_CODES)[number];

/** Mounts the flag + logo `<symbol>` definitions once. Render near the app root. */
export function FlagSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="f-AUT" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#ED2939" />
        <rect y=".667" width="3" height=".667" fill="#fff" />
      </symbol>
      <symbol id="f-POL" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#fff" />
        <rect y="1" width="3" height="1" fill="#DC143C" />
      </symbol>
      <symbol id="f-ROU" viewBox="0 0 3 2">
        <rect width="1" height="2" fill="#002B7F" />
        <rect x="1" width="1" height="2" fill="#FCD116" />
        <rect x="2" width="1" height="2" fill="#CE1126" />
      </symbol>
      <symbol id="f-SVK" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#fff" />
        <rect y=".667" width="3" height=".667" fill="#0B4EA2" />
        <rect y="1.333" width="3" height=".667" fill="#EE1C25" />
        <path
          d="M.55.5h.8v.7q0 .4-.4.6-.4-.2-.4-.6z"
          fill="#EE1C25"
          stroke="#fff"
          strokeWidth=".08"
        />
        <path d="M.95.72v.7M.72.98h.46" stroke="#fff" strokeWidth=".12" />
      </symbol>
      <symbol id="f-POR" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#FF0000" />
        <rect width="1.2" height="2" fill="#006600" />
        <circle cx="1.2" cy="1" r=".42" fill="#FFE000" />
        <circle cx="1.2" cy="1" r=".26" fill="#FF0000" />
      </symbol>
      <symbol id="f-TUR" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#E30A17" />
        <circle cx="1.1" cy="1" r=".5" fill="#fff" />
        <circle cx="1.22" cy="1" r=".4" fill="#E30A17" />
        <path
          d="M1.75 .78l.14.29.32.04-.23.22.06.32-.29-.16-.29.16.06-.32-.23-.22.32-.04z"
          fill="#fff"
        />
      </symbol>
      <symbol id="f-ITA" viewBox="0 0 3 2">
        <rect width="1" height="2" fill="#009246" />
        <rect x="1" width="1" height="2" fill="#fff" />
        <rect x="2" width="1" height="2" fill="#CE2B37" />
      </symbol>
      <symbol id="f-CZE" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#fff" />
        <rect y="1" width="3" height="1" fill="#D7141A" />
        <path d="M0 0l1.5 1L0 2z" fill="#11457E" />
      </symbol>
      <symbol id="f-CHN" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#DE2910" />
        <path
          d="M.6.3l.15.32.35.04-.26.24.07.35L.6 1.08l-.31.17.07-.35L.1.66l.35-.04z"
          fill="#FFDE00"
        />
        <circle cx="1.2" cy=".3" r=".08" fill="#FFDE00" />
        <circle cx="1.45" cy=".55" r=".08" fill="#FFDE00" />
        <circle cx="1.45" cy=".9" r=".08" fill="#FFDE00" />
        <circle cx="1.2" cy="1.15" r=".08" fill="#FFDE00" />
      </symbol>
      <symbol id="f-AUS" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#00247D" />
        <path d="M0 0l1.5 1M1.5 0L0 1" stroke="#fff" strokeWidth=".28" />
        <path d="M0 0l1.5 1M1.5 0L0 1" stroke="#CF142B" strokeWidth=".1" />
        <path d="M.75 0v1M0 .5h1.5" stroke="#fff" strokeWidth=".3" />
        <path d="M.75 0v1M0 .5h1.5" stroke="#CF142B" strokeWidth=".16" />
        <circle cx=".75" cy="1.5" r=".17" fill="#fff" />
        <circle cx="2.25" cy=".45" r=".1" fill="#fff" />
        <circle cx="2.7" cy=".8" r=".1" fill="#fff" />
        <circle cx="2.25" cy="1.6" r=".1" fill="#fff" />
        <circle cx="1.85" cy="1.05" r=".1" fill="#fff" />
        <circle cx="2.45" cy="1.05" r=".07" fill="#fff" />
      </symbol>
      <symbol id="f-SUI" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#D52B1E" />
        <path d="M1.5.45v1.1M.95 1h1.1" stroke="#fff" strokeWidth=".32" />
      </symbol>
      <symbol id="f-GER" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#000" />
        <rect y=".667" width="3" height=".667" fill="#DD0000" />
        <rect y="1.333" width="3" height=".667" fill="#FFCE00" />
      </symbol>
      <symbol id="f-ESP" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#AA151B" />
        <rect y=".5" width="3" height="1" fill="#F1BF00" />
      </symbol>
      <symbol id="f-USA" viewBox="0 0 3 2">
        <rect width="3" height="2" fill="#fff" />
        <path
          d="M0 .15h3M0 .46h3M0 .77h3M0 1.08h3M0 1.39h3M0 1.7h3"
          stroke="#B22234"
          strokeWidth=".155"
        />
        <rect width="1.2" height=".93" fill="#3C3B6E" />
      </symbol>
      <symbol id="f-FRA" viewBox="0 0 3 2">
        <rect width="1" height="2" fill="#0055A4" />
        <rect x="1" width="1" height="2" fill="#fff" />
        <rect x="2" width="1" height="2" fill="#EF4135" />
      </symbol>
      <symbol id="logo" viewBox="0 0 193 202">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M101.02 29.6602C61.4995 29.6602 29.4697 61.7002 29.4697 101.21C29.4697 140.73 61.5095 172.76 101.02 172.76C130.4 172.76 155.65 155.05 166.66 129.72C156.8 146.76 138.38 158.22 117.28 158.22C85.7903 158.22 60.2695 132.7 60.2695 101.21C60.2695 69.7202 85.8003 44.2002 117.28 44.2002C138.38 44.2002 156.8 55.6602 166.66 72.7002C155.65 47.3702 130.41 29.6602 101.02 29.6602Z"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M115.87 58.75C139.32 58.75 158.34 77.76 158.34 101.22C158.34 124.67 139.33 143.69 115.87 143.69C97.8101 143.69 82.39 132.42 76.25 116.52C81.24 124.12 89.8404 129.14 99.6104 129.14C115.03 129.14 127.53 116.64 127.53 101.22C127.53 85.8 115.03 73.3 99.6104 73.3C89.8404 73.3 81.24 78.32 76.25 85.92C82.38 70.02 97.8101 58.75 115.87 58.75Z"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M101.02 0.570312C45.4395 0.570312 0.379883 45.6303 0.379883 101.21C0.379883 156.79 45.4395 201.85 101.02 201.85C141.81 201.85 176.93 177.59 192.73 142.71C178.07 169.29 149.78 187.3 117.28 187.3C69.7303 187.3 31.1797 148.75 31.1797 101.2C31.1797 53.6503 69.7303 15.1003 117.28 15.1003C149.78 15.1003 178.07 33.1103 192.73 59.6903C176.93 24.8303 141.81 0.570312 101.02 0.570312Z"
        />
      </symbol>
    </svg>
  );
}

export interface FlagProps extends Omit<SVGAttributes<SVGSVGElement>, 'children'> {
  code: FlagCode;
  /** 13x9 inside a badge, per Baseline; default is the standalone 15x10. */
  size?: 'default' | 'badge';
}

export function Flag({ code, size = 'default', className, ...props }: FlagProps) {
  return (
    <svg
      className={cn(
        'inline-block shrink-0 rounded-[2px] align-[-1px] shadow-[0_0_0_0.5px_oklch(0_0_0_/_.18)]',
        size === 'default'
          ? 'h-2.5 w-[0.9375rem] mr-1.5'
          : 'h-[0.5625rem] w-[0.8125rem] mr-[0.3125rem]',
        className,
      )}
      aria-hidden="true"
      {...props}
    >
      <use href={`#f-${code}`} />
    </svg>
  );
}

export function Logo({ className, ...props }: Omit<SVGAttributes<SVGSVGElement>, 'children'>) {
  return (
    <svg
      viewBox="0 0 193 202"
      className={cn('block size-[1.875rem] fill-current text-foreground', className)}
      aria-label="DeuceX"
      {...props}
    >
      <use href="#logo" />
    </svg>
  );
}

const PLACE_TO_CODE: Record<string, FlagCode> = {
  poznan: 'POL',
  poznań: 'POL',
  sibiu: 'ROU',
  cluj: 'ROU',
  bratislava: 'SVK',
  lisboa: 'POR',
  lisbon: 'POR',
  antalya: 'TUR',
  genoa: 'ITA',
  biella: 'ITA',
  vicenza: 'ITA',
  bolzano: 'ITA',
  liberec: 'CZE',
  anning: 'CHN',
  vienna: 'AUT',
  vie: 'AUT',
  graz: 'AUT',
  linz: 'AUT',
  salzburg: 'AUT',
  innsbruck: 'AUT',
  klagenfurt: 'AUT',
  radstadt: 'AUT',
  melbourne: 'AUS',
  zurich: 'SUI',
};

/** Looks up the flag for a place name (`pflag()` in the Baseline prototype). */
export function placeFlag(text: string): FlagCode | null {
  return PLACE_TO_CODE[text.trim().toLowerCase()] ?? null;
}
