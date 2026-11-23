const LOOK = [
  { c: '#b5b5b5', d: '#8f8f8f' },
  { c: '#d9b64a', d: '#a78a2c' },
  { c: '#b7c93a', d: '#8a9a22' },
  { c: '#7ccf2a', d: '#5fa21c' },
  { c: '#58cc02', d: '#58a700' },
] as const;

const Eyes = ({ level, c }: { level: number; c: string }) => {
  if (level === 0) return <path d="M30 54q8 6 16 0M54 54q8 6 16 0" stroke="#555" strokeWidth="4" fill="none" strokeLinecap="round" />;
  if (level === 1) return <path d="M30 54h16M54 54h16" stroke="#222" strokeWidth="4" strokeLinecap="round" />;
  const big = level === 4;
  const r = big ? 8 : 7;
  const y = level === 2 ? 52 : 50;
  const py = level === 2 ? 54 : 51;
  return (
    <>
      <circle cx="38" cy={y} r={r} fill="#fff" /><circle cx="62" cy={y} r={r} fill="#fff" />
      <circle cx="39" cy={py} r={big ? 4 : 3.5} fill="#222" /><circle cx="63" cy={py} r={big ? 4 : 3.5} fill="#222" />
      {level === 2 && <><rect x="29" y="43" width="18" height="8" fill={c} /><rect x="53" y="43" width="18" height="8" fill={c} /></>}
    </>
  );
};

const Mouth = ({ level }: { level: number }) => {
  if (level === 4) return <path d="M38 66q12 14 24 0z" fill="#8b1a1a" />;
  if (level === 3) return <path d="M40 66q10 8 20 0" stroke="#8b1a1a" strokeWidth="4" fill="none" strokeLinecap="round" />;
  if (level === 2) return <path d="M42 70h16" stroke="#6b4a1a" strokeWidth="4" strokeLinecap="round" />;
  if (level === 1) return <path d="M42 74q8 -8 16 0" stroke="#6b4a1a" strokeWidth="4" fill="none" strokeLinecap="round" />;
  return <circle cx="50" cy="72" r="3" fill="#777" />;
};

/** Zip, the energy mascot. level = blocks left, 0 to 4. */
export function Zip({ level, hue, size = 96 }: { level: number; hue?: number; size?: number }) {
  const l = Math.min(4, Math.max(0, Math.round(level)));
  const grey = l === 0 || hue == null;
  const c = grey ? LOOK[l].c : `hsl(${hue} 65% 52%)`;
  const d = grey ? LOOK[l].d : `hsl(${hue} 65% 36%)`;
  return (
    <svg className={`zip zip-${l}`} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <g transform={`translate(0 ${[12, 8, 4, 0, 0][l]})`}>
        <ellipse cx="50" cy="92" rx="30" ry="5" fill="currentColor" opacity=".1" />
        <g className="zip-body">
          <path d="M50 20c24 0 36 16 36 38 0 20-14 32-36 32S14 78 14 58c0-22 12-38 36-38z" fill={c} stroke={d} strokeWidth="3" />
          <Eyes level={l} c={c} />
          <Mouth level={l} />
        </g>
        {l === 1 && <path className="zip-drop" d="M78 40q4 8 0 12q-4 -4 0 -12z" fill="#6ec1ff" />}
        {l === 0 && <><text className="zip-z" x="72" y="36" fontSize="14" fontWeight="800" fill="#999">z</text><text className="zip-z zip-z2" x="82" y="24" fontSize="11" fontWeight="800" fill="#bbb">z</text></>}
      </g>
    </svg>
  );
}
