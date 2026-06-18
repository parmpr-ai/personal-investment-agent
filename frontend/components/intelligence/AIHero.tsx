'use client'

import { useId } from 'react'

export type CaseType = 'BUY' | 'HOLD' | 'SELL'
export type HeroSize = 'compact' | 'expanded'
export type MotionMode = 'enabled' | 'reduced'

export interface AIHeroProps {
  caseType: CaseType
  size: HeroSize
  motion: MotionMode
  theme: 'pia-signature'
}

const C = {
  BUY:  { primary: '#31E95D', secondary: '#00D9FF', glowOpacity: 0.44, r: '0.19', g: '0.91', b: '0.36' },
  HOLD: { primary: '#FFBD28', secondary: '#00D9FF', glowOpacity: 0.40, r: '1.00', g: '0.74', b: '0.16' },
  SELL: { primary: '#FF3D3D', secondary: '#00D9FF', glowOpacity: 0.44, r: '1.00', g: '0.24', b: '0.24' },
}

const PARTICLES: Array<{ cx: number; cy: number; r: number; tx: number; ty: number; delay: number; dur: number }> = [
  { cx: 12,  cy: 18,  r: 2.0, tx: 3,  ty: -5, delay: 0,   dur: 6.0 },
  { cx: 148, cy: 20,  r: 1.6, tx: -3, ty: -5, delay: 0.6, dur: 7.2 },
  { cx: 8,   cy: 80,  r: 1.3, tx: 4,  ty: -3, delay: 1.2, dur: 5.8 },
  { cx: 152, cy: 75,  r: 1.5, tx: -4, ty: -4, delay: 1.8, dur: 6.5 },
  { cx: 80,  cy: 6,   r: 1.8, tx: 2,  ty: -5, delay: 0.4, dur: 7.0 },
  { cx: 22,  cy: 140, r: 1.4, tx: 3,  ty: -5, delay: 0.9, dur: 5.5 },
  { cx: 138, cy: 138, r: 1.7, tx: -3, ty: -5, delay: 1.5, dur: 6.8 },
  { cx: 55,  cy: 8,   r: 1.1, tx: 1,  ty: -4, delay: 2.4, dur: 7.4 },
]

function GlowFilter({ id, c }: { id: string; c: typeof C['BUY'] }) {
  return (
    <filter id={id} x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="8" result="blur1"/>
      <feColorMatrix type="matrix" in="blur1"
        values={`0 0 0 0 ${c.r}  0 0 0 0 ${c.g}  0 0 0 0 ${c.b}  0 0 0 ${c.glowOpacity} 0`}
        result="glow1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur2"/>
      <feColorMatrix type="matrix" in="blur2"
        values={`0 0 0 0 ${c.r}  0 0 0 0 ${c.g}  0 0 0 0 ${c.b}  0 0 0 0.80 0`}
        result="glow2"/>
      <feMerge>
        <feMergeNode in="glow1"/>
        <feMergeNode in="glow1"/>
        <feMergeNode in="glow2"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  )
}

// Neon wireframe BULL — 3/4 frontal-right view with wide iconic horns
// The V-shaped horns span x=4→112 (70% of viewbox) — unmistakably bull
function WireframeBull({ p, s, filterId }: { p: string; s: string; filterId: string }) {
  return (
    <g filter={`url(#${filterId})`}>
      {/* ambient glow field */}
      <ellipse cx="80" cy="90" rx="68" ry="52" fill={p} fillOpacity="0.04"/>

      {/* ── BODY — barrel mass, right side of composition ── */}
      <path d="
        M 62,118
        C 46,114 32,100 28,86
        C 24,72 30,56 44,46
        C 58,36 80,30 102,30
        C 126,30 148,40 156,56
        C 164,72 158,96 144,110
        C 128,122 98,126 62,118 Z
      " fill={p} fillOpacity="0.06" stroke={p} strokeWidth="2.2" strokeLinejoin="round"/>

      {/* body ribs — bold enough to see at 150px */}
      <path d="M 32,66 C 64,56 110,54 156,62" fill="none" stroke={p} strokeWidth="1.4" strokeOpacity="0.40"/>
      <path d="M 30,86 C 62,76 110,74 156,82" fill="none" stroke={p} strokeWidth="1.4" strokeOpacity="0.38"/>
      <path d="M 36,106 C 66,100 110,98 152,104" fill="none" stroke={p} strokeWidth="1.2" strokeOpacity="0.30"/>
      {/* vertical panels */}
      <line x1="86"  y1="30"  x2="84"  y2="124" stroke={p} strokeWidth="1.1" strokeOpacity="0.30"/>
      <line x1="118" y1="30"  x2="116" y2="122" stroke={p} strokeWidth="1.0" strokeOpacity="0.26"/>
      <line x1="144" y1="40"  x2="142" y2="112" stroke={p} strokeWidth="0.9" strokeOpacity="0.22"/>

      {/* ── SHOULDER HUMP — prominent arch connecting neck to body ── */}
      <path d="M 44,46 C 48,20 76,8 96,12 C 116,16 118,36 100,46 Z"
            fill={p} fillOpacity="0.12" stroke={p} strokeWidth="1.8" strokeLinejoin="round"/>
      {/* hump ribs */}
      <line x1="70"  y1="9"   x2="68"  y2="46" stroke={p} strokeWidth="1.0" strokeOpacity="0.30"/>
      <line x1="90"  y1="8"   x2="88"  y2="44" stroke={p} strokeWidth="1.0" strokeOpacity="0.30"/>

      {/* ── HEAD — wide, occupies left 40% of viewbox ── */}
      {/* Head spans x=10→76, y=34→114: 66px wide, 80px tall */}
      <path d="
        M 48,36
        C 36,40 22,56 16,72
        C 10,88 14,104 24,112
        C 34,118 50,116 60,104
        C 70,92 72,74 66,58
        C 60,44 52,34 48,36 Z
      " fill={p} fillOpacity="0.08" stroke={p} strokeWidth="2.2" strokeLinejoin="round"/>
      {/* head facets */}
      <line x1="16"  y1="72"  x2="68"  y2="90" stroke={p} strokeWidth="1.1" strokeOpacity="0.32"/>
      <line x1="18"  y1="96"  x2="66"  y2="60" stroke={p} strokeWidth="1.1" strokeOpacity="0.30"/>

      {/* ── MUZZLE / SNOUT ── */}
      <path d="M 16,72 C 8,80 6,94 10,104 C 14,112 24,114 24,112"
            fill={p} fillOpacity="0.14" stroke={p} strokeWidth="1.8" strokeLinecap="round"/>
      {/* nostril */}
      <ellipse cx="10" cy="100" rx="3" ry="2" fill={p} fillOpacity="0.55"/>

      {/* ── EYE ── */}
      <circle cx="42" cy="72" r="5.5" fill="none" stroke={p} strokeWidth="1.8"/>
      <circle cx="42" cy="72" r="2.4" fill={p} fillOpacity="0.90"/>
      <circle cx="41" cy="71" r="1.1" fill="white" fillOpacity="0.70"/>

      {/* ════ HORNS — THE DEFINING FEATURE ════
          Wide V spanning full upper portion of image.
          Left horn tip: (4, 6) — far upper-LEFT corner
          Right horn tip: (114, 4) — far upper-RIGHT of viewbox
          Horn bases: (26, 38) LEFT and (76, 34) RIGHT — 50px apart, from wide forehead
          Span: x=4 → x=114 = 110px = 69% of viewbox width
          This reads unmistakably as BULL HORNS, not antennae */}

      {/* Left horn — thick bezier sweeping LEFT and up */}
      <path d="M 26,38 C 20,24 12,14 4,6"
            fill="none" stroke={p} strokeWidth="4.5" strokeLinecap="round"/>
      {/* left horn inner bevel */}
      <path d="M 30,40 C 24,28 18,18 12,10"
            fill="none" stroke={p} strokeWidth="1.4" strokeOpacity="0.50" strokeLinecap="round"/>

      {/* Right horn — thick bezier sweeping RIGHT and up */}
      <path d="M 76,34 C 88,22 100,12 114,4"
            fill="none" stroke={p} strokeWidth="4.5" strokeLinecap="round"/>
      {/* right horn inner bevel */}
      <path d="M 72,38 C 84,26 96,16 108,10"
            fill="none" stroke={p} strokeWidth="1.4" strokeOpacity="0.50" strokeLinecap="round"/>

      {/* horn tip glow — secondary (cyan) color */}
      <circle cx="4"   cy="6"  r="5.5" fill={s} fillOpacity="0.82"/>
      <circle cx="114" cy="4"  r="5.5" fill={s} fillOpacity="0.82"/>
      <circle cx="4"   cy="6"  r="2.5" fill="#fff" fillOpacity="0.45"/>
      <circle cx="114" cy="4"  r="2.5" fill="#fff" fillOpacity="0.45"/>

      {/* ── LEGS — four thick legs ── */}
      {/* front pair */}
      <line x1="56"  y1="116" x2="48"  y2="152" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="48"  y1="148" x2="40"  y2="154" stroke={p} strokeWidth="2.6" strokeLinecap="round"/>
      <line x1="48"  y1="148" x2="58"  y2="155" stroke={p} strokeWidth="2.6" strokeLinecap="round"/>

      <line x1="74"  y1="120" x2="70"  y2="152" stroke={p} strokeWidth="3.0" strokeLinecap="round"/>
      <line x1="70"  y1="148" x2="62"  y2="154" stroke={p} strokeWidth="2.4" strokeLinecap="round"/>
      <line x1="70"  y1="148" x2="78"  y2="155" stroke={p} strokeWidth="2.4" strokeLinecap="round"/>

      {/* rear pair */}
      <line x1="120" y1="120" x2="116" y2="152" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="116" y1="148" x2="108" y2="154" stroke={p} strokeWidth="2.6" strokeLinecap="round"/>
      <line x1="116" y1="148" x2="124" y2="155" stroke={p} strokeWidth="2.6" strokeLinecap="round"/>

      <line x1="138" y1="118" x2="136" y2="152" stroke={p} strokeWidth="3.0" strokeLinecap="round"/>
      <line x1="136" y1="148" x2="128" y2="154" stroke={p} strokeWidth="2.4" strokeLinecap="round"/>
      <line x1="136" y1="148" x2="144" y2="155" stroke={p} strokeWidth="2.4" strokeLinecap="round"/>

      {/* ── TAIL ── */}
      <path d="M 156,74 C 164,56 168,40 162,28 C 158,18 150,22 154,34"
            fill="none" stroke={p} strokeWidth="2.2" strokeLinecap="round"/>

      {/* secondary color edge highlights */}
      <line x1="28"  y1="64"  x2="26"  y2="88"  stroke={s} strokeWidth="1.0" strokeOpacity="0.34"/>
      <line x1="156" y1="60"  x2="154" y2="90"  stroke={s} strokeWidth="1.0" strokeOpacity="0.34"/>

      {/* ground shadow */}
      <ellipse cx="82" cy="156" rx="58" ry="4.5" fill={p} fillOpacity="0.22"/>
    </g>
  )
}

// Neon wireframe BEAR — heavy, imposing, facing right
// Iconic features: rounded ears (NOT triangles), heavy haunches, massive head with muzzle
function WireframeBear({ p, s, filterId }: { p: string; s: string; filterId: string }) {
  return (
    <g filter={`url(#${filterId})`}>
      {/* ambient glow field */}
      <ellipse cx="84" cy="84" rx="64" ry="50" fill={p} fillOpacity="0.03"/>

      {/* ── BODY — heavy stocky mass ── */}
      <path d="M 38,116 C 22,108 16,90 18,74 C 20,58 30,44 46,36 C 64,26 90,24 114,28 C 138,32 158,46 162,64 C 166,82 156,102 140,114 C 120,124 76,128 38,116 Z"
            fill={p} fillOpacity="0.06" stroke={p} strokeWidth="2.0" strokeLinejoin="round"/>
      {/* body ribs */}
      <path d="M 22,60 C 52,52 100,50 160,58" fill="none" stroke={p} strokeWidth="0.9" strokeOpacity="0.35"/>
      <path d="M 20,80 C 50,72 102,70 162,78" fill="none" stroke={p} strokeWidth="0.9" strokeOpacity="0.35"/>
      <path d="M 24,100 C 54,94 102,92 158,100" fill="none" stroke={p} strokeWidth="0.8" strokeOpacity="0.28"/>
      {/* vertical panels */}
      <line x1="56"  y1="26"  x2="54"  y2="124" stroke={p} strokeWidth="0.7" strokeOpacity="0.25"/>
      <line x1="90"  y1="24"  x2="88"  y2="126" stroke={p} strokeWidth="0.7" strokeOpacity="0.25"/>
      <line x1="124" y1="27"  x2="122" y2="122" stroke={p} strokeWidth="0.65" strokeOpacity="0.22"/>
      <line x1="150" y1="36"  x2="148" y2="112" stroke={p} strokeWidth="0.60" strokeOpacity="0.20"/>

      {/* ── HEAD — large, facing right ── */}
      <path d="M 128,40 C 136,28 150,18 162,16 C 170,14 174,20 172,32 C 170,44 160,56 150,64 C 140,72 130,70 124,60 C 118,50 120,42 128,40 Z"
            fill={p} fillOpacity="0.08" stroke={p} strokeWidth="2.0" strokeLinejoin="round"/>
      {/* head facets */}
      <line x1="126" y1="44"  x2="172" y2="60" stroke={p} strokeWidth="0.7" strokeOpacity="0.28"/>
      <line x1="128" y1="58"  x2="172" y2="28" stroke={p} strokeWidth="0.7" strokeOpacity="0.28"/>
      <line x1="148" y1="16"  x2="144" y2="68" stroke={p} strokeWidth="0.65" strokeOpacity="0.24"/>

      {/* ── EARS — rounded arc shapes (not antennae triangles) ── */}
      {/* left ear — half-circle arc */}
      <path d="M 134,30 C 128,24 124,14 130,8 C 136,4 142,12 140,22 Z"
            fill={p} fillOpacity="0.12" stroke={p} strokeWidth="1.5" strokeLinejoin="round"/>
      {/* right ear */}
      <path d="M 154,24 C 150,16 148,8 154,4 C 160,2 164,10 160,20 Z"
            fill={p} fillOpacity="0.12" stroke={p} strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="131" y1="26"  x2="138" y2="10" stroke={p} strokeWidth="0.7" strokeOpacity="0.35"/>
      <line x1="152" y1="20"  x2="158" y2="6"  stroke={p} strokeWidth="0.7" strokeOpacity="0.35"/>

      {/* ── MUZZLE — projecting forward right ── */}
      <path d="M 152,56 C 158,52 168,52 172,58 C 174,64 170,72 164,76 C 156,78 150,74 150,68 Z"
            fill={p} fillOpacity="0.12" stroke={p} strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="154" y1="58"  x2="170" y2="72" stroke={p} strokeWidth="0.65" strokeOpacity="0.26"/>
      <circle cx="168" cy="66" r="2.5" fill={p} fillOpacity="0.60"/>

      {/* ── EYE ── */}
      <circle cx="138" cy="44" r="5"   fill="none" stroke={p} strokeWidth="1.6"/>
      <circle cx="138" cy="44" r="2.2" fill={p} fillOpacity="0.88"/>
      <circle cx="137" cy="43" r="1.0" fill="white" fillOpacity="0.72"/>

      {/* ── LEGS with claws ── */}
      {/* front-left */}
      <line x1="40"  y1="114" x2="34"  y2="150" stroke={p} strokeWidth="3.2" strokeLinecap="round"/>
      <line x1="34"  y1="146" x2="26"  y2="152" stroke={p} strokeWidth="2.4" strokeLinecap="round"/>
      <line x1="34"  y1="146" x2="44"  y2="153" stroke={p} strokeWidth="2.4" strokeLinecap="round"/>
      <line x1="24"  y1="152" x2="22"  y2="158" stroke={p} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="30"  y1="154" x2="28"  y2="160" stroke={p} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="38"  y1="155" x2="36"  y2="160" stroke={p} strokeWidth="1.6" strokeLinecap="round"/>
      {/* front-right */}
      <line x1="60"  y1="118" x2="56"  y2="150" stroke={p} strokeWidth="2.8" strokeLinecap="round"/>
      <line x1="56"  y1="146" x2="48"  y2="152" stroke={p} strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="56"  y1="146" x2="64"  y2="153" stroke={p} strokeWidth="2.2" strokeLinecap="round"/>
      {/* back-left */}
      <line x1="118" y1="120" x2="114" y2="150" stroke={p} strokeWidth="3.2" strokeLinecap="round"/>
      <line x1="114" y1="146" x2="106" y2="152" stroke={p} strokeWidth="2.4" strokeLinecap="round"/>
      <line x1="114" y1="146" x2="122" y2="153" stroke={p} strokeWidth="2.4" strokeLinecap="round"/>
      <line x1="104" y1="152" x2="102" y2="158" stroke={p} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="110" y1="154" x2="108" y2="160" stroke={p} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="118" y1="155" x2="116" y2="160" stroke={p} strokeWidth="1.6" strokeLinecap="round"/>
      {/* back-right */}
      <line x1="138" y1="118" x2="136" y2="150" stroke={p} strokeWidth="2.8" strokeLinecap="round"/>
      <line x1="136" y1="146" x2="128" y2="152" stroke={p} strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="136" y1="146" x2="144" y2="153" stroke={p} strokeWidth="2.2" strokeLinecap="round"/>

      {/* secondary color accents */}
      <path d="M 20,66 L 18,88" stroke={s} strokeWidth="0.9" strokeOpacity="0.32"/>
      <path d="M 162,52 L 160,82" stroke={s} strokeWidth="0.9" strokeOpacity="0.32"/>
      <circle cx="10"  cy="10" r="1.8" fill={s} fillOpacity="0.38"/>
      <circle cx="170" cy="8"  r="1.8" fill={s} fillOpacity="0.38"/>

      {/* ground shadow */}
      <ellipse cx="84" cy="156" rx="58" ry="4" fill={p} fillOpacity="0.20"/>
    </g>
  )
}

// Neon wireframe BALANCE — precision scale, bull vs bear equilibrium
function WireframeBalance({ p, s, filterId }: { p: string; s: string; filterId: string }) {
  return (
    <g filter={`url(#${filterId})`}>
      {/* ambient glow field */}
      <ellipse cx="80" cy="84" rx="68" ry="48" fill={p} fillOpacity="0.03"/>

      {/* ── CENTRAL PILLAR ── */}
      <rect x="77" y="24" width="6" height="108" rx="3"
            fill={p} fillOpacity="0.08" stroke={p} strokeWidth="1.5"/>
      {/* pillar ribs */}
      {[36, 52, 68, 84, 100].map(y => (
        <line key={y} x1="75" y1={y} x2="85" y2={y} stroke={p} strokeWidth="0.9" strokeOpacity="0.42"/>
      ))}

      {/* ── BASE ── */}
      <path d="M 62,128 L 66,120 L 94,120 L 98,128 L 104,134 L 56,134 Z"
            fill={p} fillOpacity="0.10" stroke={p} strokeWidth="1.4" strokeLinejoin="round"/>
      <line x1="62" y1="128" x2="98" y2="128" stroke={p} strokeWidth="0.8" strokeOpacity="0.42"/>

      {/* ── BEAM — horizontal, balanced ── */}
      <rect x="12" y="40" width="136" height="5" rx="2.5"
            fill={p} fillOpacity="0.10" stroke={p} strokeWidth="1.8"/>
      {/* beam scale markings */}
      {[28, 44, 60, 100, 116, 132].map(x => (
        <line key={x} x1={x} y1="37" x2={x} y2="49" stroke={p} strokeWidth="0.8" strokeOpacity="0.40"/>
      ))}

      {/* ── CENTER PIVOT — diamond ── */}
      <path d="M 80,32 L 88,42 L 80,52 L 72,42 Z"
            fill={p} fillOpacity="0.14" stroke={p} strokeWidth="1.6"/>
      <circle cx="80" cy="42" r="3.5" fill={p} fillOpacity="0.82"/>
      <circle cx="80" cy="42" r="1.5" fill={s} fillOpacity="0.62"/>

      {/* ── BEAM END NODES ── */}
      <circle cx="14"  cy="42" r="5"   fill={p} fillOpacity="0.12" stroke={p} strokeWidth="1.5"/>
      <circle cx="14"  cy="42" r="2.5" fill={s} fillOpacity="0.60"/>
      <circle cx="146" cy="42" r="5"   fill={p} fillOpacity="0.12" stroke={p} strokeWidth="1.5"/>
      <circle cx="146" cy="42" r="2.5" fill={s} fillOpacity="0.60"/>

      {/* ── LEFT PAN CHAINS ── */}
      <line x1="16"  y1="47"  x2="14"  y2="74"  stroke={p} strokeWidth="1.0" strokeDasharray="3 2.5" strokeOpacity="0.72"/>
      <line x1="20"  y1="47"  x2="18"  y2="74"  stroke={p} strokeWidth="0.8" strokeDasharray="3 2.5" strokeOpacity="0.52"/>
      <line x1="24"  y1="47"  x2="22"  y2="74"  stroke={p} strokeWidth="0.8" strokeDasharray="3 2.5" strokeOpacity="0.52"/>

      {/* ── RIGHT PAN CHAINS ── */}
      <line x1="144" y1="47"  x2="146" y2="74"  stroke={p} strokeWidth="1.0" strokeDasharray="3 2.5" strokeOpacity="0.72"/>
      <line x1="140" y1="47"  x2="142" y2="74"  stroke={p} strokeWidth="0.8" strokeDasharray="3 2.5" strokeOpacity="0.52"/>
      <line x1="136" y1="47"  x2="138" y2="74"  stroke={p} strokeWidth="0.8" strokeDasharray="3 2.5" strokeOpacity="0.52"/>

      {/* ── LEFT PAN — hexagonal ── */}
      <path d="M 8,74 L 12,68 L 32,68 L 36,74 L 32,88 L 12,88 Z"
            fill={p} fillOpacity="0.08" stroke={p} strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="12" y1="68" x2="32" y2="88" stroke={p} strokeWidth="0.6" strokeOpacity="0.28"/>
      <line x1="32" y1="68" x2="12" y2="88" stroke={p} strokeWidth="0.6" strokeOpacity="0.28"/>

      {/* ── RIGHT PAN ── */}
      <path d="M 124,74 L 128,68 L 148,68 L 152,74 L 148,88 L 128,88 Z"
            fill={p} fillOpacity="0.08" stroke={p} strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="128" y1="68" x2="148" y2="88" stroke={p} strokeWidth="0.6" strokeOpacity="0.28"/>
      <line x1="148" y1="68" x2="128" y2="88" stroke={p} strokeWidth="0.6" strokeOpacity="0.28"/>

      {/* ── BULL SYMBOL in LEFT PAN — wide V horns ── */}
      <path d="M 22,80 C 16,72 10,66 8,60" fill="none" stroke={p} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M 22,80 C 28,72 32,66 36,60" fill="none" stroke={p} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M 12,80 C 16,76 20,74 22,79 C 24,76 28,76 32,80" fill="none" stroke={p} strokeWidth="1.0" strokeOpacity="0.65"/>
      <line x1="22" y1="84" x2="22" y2="80" stroke={p} strokeWidth="1.5" strokeOpacity="0.6"/>
      <path d="M 19,82 L 22,80 L 25,82" fill="none" stroke={p} strokeWidth="1.2" strokeOpacity="0.55"/>

      {/* ── BEAR SYMBOL in RIGHT PAN — rounded head with ears ── */}
      <circle cx="138" cy="78" r="7.5" fill="none" stroke={p} strokeWidth="1.3" strokeOpacity="0.78"/>
      <path d="M 130,73 C 128,68 126,65 129,63 C 132,61 133,65 133,70" fill="none" stroke={p} strokeWidth="1.1" strokeOpacity="0.72"/>
      <path d="M 146,73 C 148,68 150,65 147,63 C 144,61 143,65 143,70" fill="none" stroke={p} strokeWidth="1.1" strokeOpacity="0.72"/>
      <line x1="138" y1="80" x2="138" y2="86" stroke={p} strokeWidth="1.5" strokeOpacity="0.60"/>
      <path d="M 135,84 L 138,86 L 141,84" fill="none" stroke={p} strokeWidth="1.2" strokeOpacity="0.55"/>

      {/* secondary color accents */}
      <circle cx="6"   cy="8"  r="1.8" fill={s} fillOpacity="0.40"/>
      <circle cx="154" cy="8"  r="1.8" fill={s} fillOpacity="0.40"/>
      <line x1="80"  y1="24"  x2="80"  y2="36"  stroke={s} strokeWidth="1.0" strokeOpacity="0.40"/>

      {/* ground shadow */}
      <ellipse cx="80" cy="144" rx="50" ry="4" fill={p} fillOpacity="0.18"/>
    </g>
  )
}

export default function AIHero({ caseType, size, motion, theme: _theme }: AIHeroProps) {
  const uid = useId().replace(/:/g, '')
  const c = C[caseType]
  const p = c.primary
  const s = c.secondary
  const filterId = `aihero-glow-${uid}`

  // compact: 150px — fits grid without overflow at 360–430px viewports
  // expanded: 210px — impressive but doesn't push AI Summary below fold
  const sz = size === 'compact' ? 150 : 210

  const animClass =
    motion === 'reduced' ? 'ai-hero-reduced' :
    caseType === 'BUY'   ? 'ai-hero-orbit-up' :
    caseType === 'SELL'  ? 'ai-hero-orbit-down' :
                           'ai-hero-oscillate'

  return (
    <div className={`ai-hero ai-hero-${caseType.toLowerCase()}`} style={{ width: sz, height: sz }}>
      <svg
        viewBox="0 0 160 160"
        width={sz}
        height={sz}
        fill="none"
        aria-hidden="true"
        overflow="visible"
        className={`ai-hero-svg ${animClass}`}
        style={{ transformOrigin: 'center', willChange: 'transform' }}
      >
        <defs>
          <GlowFilter id={filterId} c={c} />
        </defs>

        {motion !== 'reduced' && PARTICLES.map((pt, i) => (
          <circle
            key={i}
            cx={pt.cx}
            cy={pt.cy}
            r={pt.r}
            fill={p}
            fillOpacity={0.30}
            className="ai-hero-particle"
            style={{
              '--ptx': `${pt.tx}px`,
              '--pty': `${pt.ty}px`,
              animationDuration: `${pt.dur}s`,
              animationDelay: `${pt.delay}s`,
            } as React.CSSProperties}
          />
        ))}

        {caseType === 'BUY'  && <WireframeBull    p={p} s={s} filterId={filterId} />}
        {caseType === 'SELL' && <WireframeBear    p={p} s={s} filterId={filterId} />}
        {caseType === 'HOLD' && <WireframeBalance p={p} s={s} filterId={filterId} />}
      </svg>
    </div>
  )
}
