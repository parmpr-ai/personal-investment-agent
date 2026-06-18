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
  BUY:  { primary: '#31E95D', secondary: '#00D9FF', glowOpacity: 0.45, r: '0.19', g: '0.91', b: '0.36' },
  HOLD: { primary: '#FFBD28', secondary: '#00D9FF', glowOpacity: 0.40, r: '1.00', g: '0.74', b: '0.16' },
  SELL: { primary: '#FF3D3D', secondary: '#00D9FF', glowOpacity: 0.45, r: '1.00', g: '0.24', b: '0.24' },
}

// Deterministic particles per case (no random — SSR safe)
const PARTICLES: Record<CaseType, Array<{ cx: number; cy: number; r: number; tx: number; ty: number; delay: number; dur: number }>> = {
  BUY: [
    { cx: 14,  cy: 38,  r: 2.2, tx: 3,  ty: -5, delay: 0,   dur: 6.0 },
    { cx: 168, cy: 26,  r: 1.8, tx: -3, ty: -4, delay: 0.6, dur: 7.2 },
    { cx: 7,   cy: 92,  r: 1.4, tx: 4,  ty: -3, delay: 1.2, dur: 5.8 },
    { cx: 175, cy: 82,  r: 1.6, tx: -4, ty: -3, delay: 1.8, dur: 6.5 },
    { cx: 78,  cy: 7,   r: 2.0, tx: 2,  ty: -5, delay: 0.4, dur: 7.0 },
    { cx: 132, cy: 11,  r: 1.4, tx: -2, ty: -4, delay: 2.1, dur: 6.2 },
    { cx: 20,  cy: 128, r: 1.5, tx: 3,  ty: -6, delay: 0.9, dur: 5.5 },
    { cx: 160, cy: 122, r: 1.8, tx: -3, ty: -5, delay: 1.5, dur: 6.8 },
    { cx: 48,  cy: 5,   r: 1.2, tx: 1,  ty: -4, delay: 2.4, dur: 7.4 },
    { cx: 146, cy: 135, r: 1.3, tx: -2, ty: -4, delay: 0.3, dur: 6.3 },
    { cx: 5,   cy: 62,  r: 1.0, tx: 4,  ty: -2, delay: 1.7, dur: 5.9 },
    { cx: 173, cy: 58,  r: 1.2, tx: -3, ty: -2, delay: 2.8, dur: 7.1 },
  ],
  HOLD: [
    { cx: 10,  cy: 35,  r: 2.0, tx: 2,  ty: -3, delay: 0,   dur: 7.0 },
    { cx: 190, cy: 30,  r: 1.8, tx: -2, ty: -3, delay: 0.8, dur: 6.5 },
    { cx: 6,   cy: 80,  r: 1.4, tx: 2,  ty: -2, delay: 1.6, dur: 5.8 },
    { cx: 194, cy: 85,  r: 1.4, tx: -2, ty: -2, delay: 2.4, dur: 6.8 },
    { cx: 95,  cy: 8,   r: 1.8, tx: 1,  ty: -4, delay: 0.5, dur: 7.2 },
    { cx: 108, cy: 10,  r: 1.2, tx: -1, ty: -4, delay: 1.3, dur: 6.0 },
    { cx: 20,  cy: 125, r: 1.5, tx: 2,  ty: -5, delay: 2.0, dur: 5.6 },
    { cx: 182, cy: 122, r: 1.5, tx: -2, ty: -5, delay: 2.8, dur: 7.4 },
  ],
  SELL: [
    { cx: 14,  cy: 38,  r: 2.2, tx: 3,  ty: 5,  delay: 0,   dur: 6.0 },
    { cx: 168, cy: 26,  r: 1.8, tx: -3, ty: 4,  delay: 0.6, dur: 7.2 },
    { cx: 7,   cy: 92,  r: 1.4, tx: 4,  ty: 3,  delay: 1.2, dur: 5.8 },
    { cx: 175, cy: 82,  r: 1.6, tx: -4, ty: 3,  delay: 1.8, dur: 6.5 },
    { cx: 78,  cy: 7,   r: 2.0, tx: 2,  ty: 5,  delay: 0.4, dur: 7.0 },
    { cx: 132, cy: 11,  r: 1.4, tx: -2, ty: 4,  delay: 2.1, dur: 6.2 },
    { cx: 20,  cy: 128, r: 1.5, tx: 3,  ty: 6,  delay: 0.9, dur: 5.5 },
    { cx: 160, cy: 122, r: 1.8, tx: -3, ty: 5,  delay: 1.5, dur: 6.8 },
    { cx: 48,  cy: 5,   r: 1.2, tx: 1,  ty: 4,  delay: 2.4, dur: 7.4 },
    { cx: 146, cy: 135, r: 1.3, tx: -2, ty: 4,  delay: 0.3, dur: 6.3 },
    { cx: 5,   cy: 62,  r: 1.0, tx: 4,  ty: 2,  delay: 1.7, dur: 5.9 },
    { cx: 173, cy: 58,  r: 1.2, tx: -3, ty: 2,  delay: 2.8, dur: 7.1 },
  ],
}

function GlowFilter({ id, c }: { id: string; c: typeof C['BUY'] }) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="9" result="blur"/>
      <feColorMatrix
        type="matrix"
        in="blur"
        values={`0 0 0 0 ${c.r}  0 0 0 0 ${c.g}  0 0 0 0 ${c.b}  0 0 0 ${c.glowOpacity} 0`}
        result="glow"
      />
      <feMerge>
        <feMergeNode in="glow"/>
        <feMergeNode in="glow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  )
}

// Neon Holographic Wireframe Bull — angular geometry, forward-facing, slightly aggressive
function WireframeBull({ p, s, filterId }: { p: string; s: string; filterId: string }) {
  return (
    <g filter={`url(#${filterId})`}>
      {/* ambient inner glow disc */}
      <ellipse cx="92" cy="82" rx="58" ry="45" fill={p} fillOpacity="0.06"/>
      {/* body — main angular polygon */}
      <polygon points="52,108 60,72 82,60 112,60 130,74 136,108"
               fill={p} fillOpacity="0.06" stroke={p} strokeWidth="1.3" strokeLinejoin="round"/>
      {/* body panel cross-braces */}
      <line x1="60" y1="72" x2="112" y2="60" stroke={p} strokeWidth="0.7" strokeOpacity="0.35"/>
      <line x1="82" y1="60" x2="136" y2="108" stroke={p} strokeWidth="0.6" strokeOpacity="0.25"/>
      <line x1="52" y1="108" x2="130" y2="74" stroke={p} strokeWidth="0.6" strokeOpacity="0.25"/>
      <line x1="82" y1="60" x2="75" y2="108" stroke={p} strokeWidth="0.7" strokeOpacity="0.3"/>
      <line x1="112" y1="60" x2="108" y2="108" stroke={p} strokeWidth="0.7" strokeOpacity="0.3"/>
      {/* upper shoulder panel */}
      <polygon points="82,60 98,44 118,50 112,60"
               fill={p} fillOpacity="0.08" stroke={p} strokeWidth="1.1" strokeLinejoin="round"/>
      <line x1="82" y1="60" x2="118" y2="50" stroke={p} strokeWidth="0.6" strokeOpacity="0.3"/>
      {/* neck */}
      <line x1="98" y1="44" x2="88" y2="58" stroke={p} strokeWidth="1.0" strokeOpacity="0.5"/>
      <line x1="118" y1="50" x2="112" y2="62" stroke={p} strokeWidth="1.0" strokeOpacity="0.5"/>
      {/* head */}
      <polygon points="96,44 108,32 126,38 130,52 118,58 98,50"
               fill={p} fillOpacity="0.09" stroke={p} strokeWidth="1.4" strokeLinejoin="round"/>
      <line x1="96" y1="44" x2="130" y2="52" stroke={p} strokeWidth="0.7" strokeOpacity="0.3"/>
      <line x1="108" y1="32" x2="118" y2="58" stroke={p} strokeWidth="0.6" strokeOpacity="0.25"/>
      {/* snout */}
      <polygon points="116,35 124,28 136,33 132,44 122,44"
               fill={p} fillOpacity="0.12" stroke={p} strokeWidth="1.0" strokeLinejoin="round"/>
      {/* left horn */}
      <line x1="100" y1="34" x2="88"  y2="16" stroke={p} strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="88"  y1="16" x2="98"  y2="26" stroke={p} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6"/>
      {/* right horn */}
      <line x1="114" y1="31" x2="128" y2="14" stroke={p} strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="128" y1="14" x2="120" y2="25" stroke={p} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6"/>
      {/* horn secondary color tips */}
      <circle cx="88"  cy="16" r="2.5" fill={s} fillOpacity="0.5"/>
      <circle cx="128" cy="14" r="2.5" fill={s} fillOpacity="0.5"/>
      {/* eye */}
      <circle cx="120" cy="42" r="4.0" fill="none" stroke={p} strokeWidth="1.4"/>
      <circle cx="120" cy="42" r="2.0" fill={p} fillOpacity="0.85"/>
      <circle cx="119" cy="41" r="0.9" fill="white" fillOpacity="0.6"/>
      {/* front-left leg */}
      <line x1="62"  y1="108" x2="56"  y2="130" stroke={p} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="54"  y1="128" x2="64"  y2="132" stroke={p} strokeWidth="1.5" strokeLinecap="round"/>
      {/* front-right leg */}
      <line x1="78"  y1="108" x2="74"  y2="130" stroke={p} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="72"  y1="128" x2="82"  y2="132" stroke={p} strokeWidth="1.5" strokeLinecap="round"/>
      {/* back-left leg */}
      <line x1="102" y1="108" x2="98"  y2="130" stroke={p} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="96"  y1="128" x2="106" y2="132" stroke={p} strokeWidth="1.5" strokeLinecap="round"/>
      {/* back-right leg */}
      <line x1="120" y1="108" x2="118" y2="130" stroke={p} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="116" y1="128" x2="126" y2="132" stroke={p} strokeWidth="1.5" strokeLinecap="round"/>
      {/* tail */}
      <path d="M52,94 C40,90 34,78 38,66" fill="none" stroke={p} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M38,66 C35,58 30,55 34,60" fill="none" stroke={p} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5"/>
      {/* secondary accent edge lines on body */}
      <line x1="60" y1="72" x2="52" y2="108" stroke={s} strokeWidth="0.7" strokeOpacity="0.3"/>
      <line x1="130" y1="74" x2="136" y2="108" stroke={s} strokeWidth="0.7" strokeOpacity="0.3"/>
      {/* ground plane ellipse */}
      <ellipse cx="92" cy="136" rx="44" ry="3.5" fill={p} fillOpacity="0.18"/>
    </g>
  )
}

// Neon Holographic Wireframe Bear — heavy stance, controlled, institutional
function WireframeBear({ p, s, filterId }: { p: string; s: string; filterId: string }) {
  return (
    <g filter={`url(#${filterId})`}>
      {/* ambient inner glow disc */}
      <ellipse cx="95" cy="82" rx="56" ry="48" fill={p} fillOpacity="0.06"/>
      {/* main body polygon */}
      <polygon points="50,112 56,76 78,60 114,60 134,76 138,112"
               fill={p} fillOpacity="0.06" stroke={p} strokeWidth="1.3" strokeLinejoin="round"/>
      {/* body mesh */}
      <line x1="56" y1="76" x2="114" y2="60" stroke={p} strokeWidth="0.7" strokeOpacity="0.3"/>
      <line x1="78" y1="60" x2="50"  y2="112" stroke={p} strokeWidth="0.6" strokeOpacity="0.22"/>
      <line x1="114" y1="60" x2="138" y2="112" stroke={p} strokeWidth="0.6" strokeOpacity="0.22"/>
      <line x1="78" y1="60" x2="82"  y2="112" stroke={p} strokeWidth="0.7" strokeOpacity="0.28"/>
      <line x1="114" y1="60" x2="108" y2="112" stroke={p} strokeWidth="0.7" strokeOpacity="0.28"/>
      <line x1="56" y1="76" x2="138" y2="76"  stroke={p} strokeWidth="0.6" strokeOpacity="0.22"/>
      {/* chest panel */}
      <polygon points="78,60 94,50 108,55 114,60"
               fill={p} fillOpacity="0.1" stroke={p} strokeWidth="1.0" strokeLinejoin="round"/>
      {/* head outer */}
      <circle cx="94" cy="38" r="27" fill={p} fillOpacity="0.05" stroke={p} strokeWidth="1.2"/>
      {/* head face panel (inner geometry) */}
      <polygon points="74,40 82,28 106,28 116,40 110,54 78,54"
               fill={p} fillOpacity="0.09" stroke={p} strokeWidth="1.0" strokeLinejoin="round"/>
      <line x1="74" y1="40" x2="116" y2="40" stroke={p} strokeWidth="0.6" strokeOpacity="0.3"/>
      <line x1="82" y1="28" x2="110" y2="54" stroke={p} strokeWidth="0.5" strokeOpacity="0.2"/>
      <line x1="106" y1="28" x2="78"  y2="54" stroke={p} strokeWidth="0.5" strokeOpacity="0.2"/>
      {/* left ear */}
      <circle cx="70" cy="18" r="12" fill={p} fillOpacity="0.07" stroke={p} strokeWidth="1.2"/>
      <circle cx="70" cy="18" r="6.5" fill={p} fillOpacity="0.12" stroke={p} strokeWidth="0.9"/>
      <line x1="70" y1="6"  x2="70" y2="30" stroke={p} strokeWidth="0.5" strokeOpacity="0.25"/>
      <line x1="58" y1="18" x2="82" y2="18" stroke={p} strokeWidth="0.5" strokeOpacity="0.25"/>
      {/* right ear */}
      <circle cx="118" cy="18" r="12" fill={p} fillOpacity="0.07" stroke={p} strokeWidth="1.2"/>
      <circle cx="118" cy="18" r="6.5" fill={p} fillOpacity="0.12" stroke={p} strokeWidth="0.9"/>
      <line x1="118" y1="6"  x2="118" y2="30" stroke={p} strokeWidth="0.5" strokeOpacity="0.25"/>
      <line x1="106" y1="18" x2="130" y2="18" stroke={p} strokeWidth="0.5" strokeOpacity="0.25"/>
      {/* left eye */}
      <circle cx="82"  cy="36" r="4.5" fill="none" stroke={p} strokeWidth="1.4"/>
      <circle cx="82"  cy="36" r="2.0" fill={p} fillOpacity="0.9"/>
      <circle cx="81"  cy="35" r="0.9" fill="white" fillOpacity="0.6"/>
      {/* right eye */}
      <circle cx="106" cy="36" r="4.5" fill="none" stroke={p} strokeWidth="1.4"/>
      <circle cx="106" cy="36" r="2.0" fill={p} fillOpacity="0.9"/>
      <circle cx="105" cy="35" r="0.9" fill="white" fillOpacity="0.6"/>
      {/* snout */}
      <ellipse cx="94" cy="48" rx="11" ry="8.5" fill={p} fillOpacity="0.1" stroke={p} strokeWidth="1.0"/>
      {/* secondary color: ear inner highlight */}
      <circle cx="70"  cy="18" r="3" fill={s} fillOpacity="0.3"/>
      <circle cx="118" cy="18" r="3" fill={s} fillOpacity="0.3"/>
      {/* front-left leg */}
      <line x1="60"  y1="112" x2="54"  y2="132" stroke={p} strokeWidth="2.0" strokeLinecap="round"/>
      <line x1="50"  y1="130" x2="60"  y2="134" stroke={p} strokeWidth="1.5" strokeLinecap="round"/>
      {/* front-right leg */}
      <line x1="80"  y1="112" x2="76"  y2="132" stroke={p} strokeWidth="2.0" strokeLinecap="round"/>
      <line x1="72"  y1="130" x2="82"  y2="134" stroke={p} strokeWidth="1.5" strokeLinecap="round"/>
      {/* back-left leg */}
      <line x1="110" y1="112" x2="106" y2="132" stroke={p} strokeWidth="2.0" strokeLinecap="round"/>
      <line x1="102" y1="130" x2="112" y2="134" stroke={p} strokeWidth="1.5" strokeLinecap="round"/>
      {/* back-right leg */}
      <line x1="130" y1="112" x2="130" y2="132" stroke={p} strokeWidth="2.0" strokeLinecap="round"/>
      <line x1="126" y1="130" x2="136" y2="134" stroke={p} strokeWidth="1.5" strokeLinecap="round"/>
      {/* claws */}
      <line x1="52"  y1="134" x2="49"  y2="137" stroke={p} strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="56"  y1="134" x2="54"  y2="137" stroke={p} strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="60"  y1="134" x2="58"  y2="137" stroke={p} strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="74"  y1="134" x2="72"  y2="137" stroke={p} strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="78"  y1="134" x2="77"  y2="137" stroke={p} strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="82"  y1="134" x2="81"  y2="137" stroke={p} strokeWidth="1.2" strokeLinecap="round"/>
      {/* ground plane */}
      <ellipse cx="94" cy="140" rx="46" ry="3.5" fill={p} fillOpacity="0.18"/>
    </g>
  )
}

// Neon Holographic Balance — bull left, bear right, center balance point
function WireframeBalance({ p, s, filterId }: { p: string; s: string; filterId: string }) {
  return (
    <g filter={`url(#${filterId})`}>
      {/* ambient inner glow */}
      <ellipse cx="100" cy="85" rx="82" ry="46" fill={p} fillOpacity="0.05"/>
      {/* center pillar */}
      <line x1="100" y1="22" x2="100" y2="122" stroke={p} strokeWidth="1.8" strokeOpacity="0.7"/>
      {/* decorative pillar ribs */}
      <line x1="96" y1="40"  x2="104" y2="40"  stroke={p} strokeWidth="0.8" strokeOpacity="0.4"/>
      <line x1="96" y1="60"  x2="104" y2="60"  stroke={p} strokeWidth="0.8" strokeOpacity="0.4"/>
      <line x1="96" y1="80"  x2="104" y2="80"  stroke={p} strokeWidth="0.8" strokeOpacity="0.4"/>
      {/* balance beam */}
      <line x1="32" y1="50" x2="168" y2="50" stroke={p} strokeWidth="1.8"/>
      {/* center pivot circle */}
      <circle cx="100" cy="48" r="6.5" fill="none" stroke={p} strokeWidth="1.5"/>
      <circle cx="100" cy="48" r="2.5" fill={p} fillOpacity="0.8"/>
      {/* left hanging line */}
      <line x1="38"  y1="50" x2="36"  y2="72" stroke={p} strokeWidth="1.0" strokeDasharray="3 3" strokeOpacity="0.7"/>
      {/* right hanging line */}
      <line x1="162" y1="50" x2="164" y2="72" stroke={p} strokeWidth="1.0" strokeDasharray="3 3" strokeOpacity="0.7"/>
      {/* secondary color accent on beam ends */}
      <circle cx="32"  cy="50" r="3" fill={s} fillOpacity="0.55"/>
      <circle cx="168" cy="50" r="3" fill={s} fillOpacity="0.55"/>

      {/* ── LEFT mini bull ── */}
      {/* body */}
      <polygon points="20,110 26,84 40,76 58,76 66,84 66,110"
               fill={p} fillOpacity="0.07" stroke={p} strokeWidth="1.0" strokeLinejoin="round"/>
      <line x1="26" y1="84" x2="58" y2="76" stroke={p} strokeWidth="0.5" strokeOpacity="0.3"/>
      <line x1="40" y1="76" x2="20" y2="110" stroke={p} strokeWidth="0.4" strokeOpacity="0.2"/>
      {/* shoulder */}
      <polygon points="40,76 48,66 58,70 58,76" fill={p} fillOpacity="0.09" stroke={p} strokeWidth="0.9"/>
      {/* head */}
      <polygon points="46,66 52,57 64,61 66,72 58,74" fill={p} fillOpacity="0.1" stroke={p} strokeWidth="1.0" strokeLinejoin="round"/>
      {/* horns */}
      <line x1="48" y1="58" x2="42" y2="46" stroke={p} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="58" y1="55" x2="64" y2="44" stroke={p} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="42" cy="46" r="1.8" fill={s} fillOpacity="0.5"/>
      <circle cx="64" cy="44" r="1.8" fill={s} fillOpacity="0.5"/>
      {/* eye */}
      <circle cx="60" cy="64" r="2.8" fill="none" stroke={p} strokeWidth="1.0"/>
      <circle cx="60" cy="64" r="1.2" fill={p} fillOpacity="0.85"/>
      {/* legs */}
      <line x1="24" y1="110" x2="22" y2="124" stroke={p} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="34" y1="110" x2="32" y2="124" stroke={p} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="50" y1="110" x2="49" y2="124" stroke={p} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="62" y1="110" x2="62" y2="124" stroke={p} strokeWidth="1.4" strokeLinecap="round"/>

      {/* ── RIGHT mini bear ── */}
      {/* body */}
      <polygon points="134,110 136,80 152,70 166,70 176,82 176,110"
               fill={p} fillOpacity="0.07" stroke={p} strokeWidth="1.0" strokeLinejoin="round"/>
      <line x1="136" y1="80" x2="166" y2="70" stroke={p} strokeWidth="0.5" strokeOpacity="0.3"/>
      <line x1="152" y1="70" x2="134" y2="110" stroke={p} strokeWidth="0.4" strokeOpacity="0.2"/>
      {/* head */}
      <circle cx="157" cy="56" r="18" fill={p} fillOpacity="0.05" stroke={p} strokeWidth="1.0"/>
      <polygon points="143,56 149,46 165,46 171,56 166,66 148,66"
               fill={p} fillOpacity="0.08" stroke={p} strokeWidth="0.9" strokeLinejoin="round"/>
      {/* ears */}
      <circle cx="144" cy="42" r="9"  fill={p} fillOpacity="0.07" stroke={p} strokeWidth="1.0"/>
      <circle cx="144" cy="42" r="4.5" fill={p} fillOpacity="0.12" stroke={p} strokeWidth="0.7"/>
      <circle cx="170" cy="42" r="9"  fill={p} fillOpacity="0.07" stroke={p} strokeWidth="1.0"/>
      <circle cx="170" cy="42" r="4.5" fill={p} fillOpacity="0.12" stroke={p} strokeWidth="0.7"/>
      {/* eyes */}
      <circle cx="150" cy="53" r="3.0" fill="none" stroke={p} strokeWidth="1.0"/>
      <circle cx="150" cy="53" r="1.2" fill={p} fillOpacity="0.9"/>
      <circle cx="164" cy="53" r="3.0" fill="none" stroke={p} strokeWidth="1.0"/>
      <circle cx="164" cy="53" r="1.2" fill={p} fillOpacity="0.9"/>
      {/* snout */}
      <ellipse cx="157" cy="62" rx="8" ry="6" fill={p} fillOpacity="0.1" stroke={p} strokeWidth="0.8"/>
      {/* legs */}
      <line x1="138" y1="110" x2="136" y2="124" stroke={p} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="150" y1="110" x2="148" y2="124" stroke={p} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="164" y1="110" x2="164" y2="124" stroke={p} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="174" y1="110" x2="175" y2="124" stroke={p} strokeWidth="1.4" strokeLinecap="round"/>

      {/* ground plane */}
      <ellipse cx="100" cy="130" rx="76" ry="3.5" fill={p} fillOpacity="0.18"/>
    </g>
  )
}

export default function AIHero({ caseType, size, motion, theme: _theme }: AIHeroProps) {
  const uid = useId().replace(/:/g, '')
  const c = C[caseType]
  const p = c.primary
  const s = c.secondary
  const filterId = `aihero-glow-${uid}`
  const particles = PARTICLES[caseType]

  const sz = size === 'compact' ? 240 : 300
  const vbW = caseType === 'HOLD' ? 200 : 180
  const vbH = 145

  const animClass =
    motion === 'reduced' ? 'ai-hero-reduced' :
    caseType === 'BUY'   ? 'ai-hero-orbit-up' :
    caseType === 'SELL'  ? 'ai-hero-orbit-down' :
                           'ai-hero-oscillate'

  return (
    <div className={`ai-hero ai-hero-${caseType.toLowerCase()}`} style={{ width: sz, height: sz }}>
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
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

        {/* particles */}
        {motion !== 'reduced' && particles.map((pt, i) => (
          <circle
            key={i}
            cx={pt.cx}
            cy={pt.cy}
            r={pt.r}
            fill={p}
            fillOpacity={0.25}
            className="ai-hero-particle"
            style={{
              '--ptx': `${pt.tx}px`,
              '--pty': `${pt.ty}px`,
              animationDuration: `${pt.dur}s`,
              animationDelay: `${pt.delay}s`,
            } as React.CSSProperties}
          />
        ))}

        {/* wireframe hero */}
        {caseType === 'BUY'  && <WireframeBull  p={p} s={s} filterId={filterId} />}
        {caseType === 'SELL' && <WireframeBear  p={p} s={s} filterId={filterId} />}
        {caseType === 'HOLD' && <WireframeBalance p={p} s={s} filterId={filterId} />}
      </svg>
    </div>
  )
}
