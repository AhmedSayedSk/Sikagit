/** Parses ANSI SGR escape codes into styled segments */

export interface AnsiSegment {
  text: string;
  style: React.CSSProperties;
}

const ANSI_COLORS: Record<number, string> = {
  30: '#6e6a86', // black (dimmed)
  31: '#eb6f92', // red
  32: '#9ccfd8', // green
  33: '#f6c177', // yellow
  34: '#31748f', // blue
  35: '#c4a7e7', // magenta
  36: '#5ccfd6', // cyan
  37: '#e0def4', // white
  90: '#908caa', // bright black (gray)
  91: '#ff6e8e', // bright red
  92: '#a8e4d0', // bright green
  93: '#ffd898', // bright yellow
  94: '#4da0b0', // bright blue
  95: '#d4b8f0', // bright magenta
  96: '#7ee8e8', // bright cyan
  97: '#ffffff', // bright white
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#6e6a86',
  41: '#eb6f92',
  42: '#9ccfd8',
  43: '#f6c177',
  44: '#31748f',
  45: '#c4a7e7',
  46: '#5ccfd6',
  47: '#e0def4',
  100: '#908caa',
  101: '#ff6e8e',
  102: '#a8e4d0',
  103: '#ffd898',
  104: '#4da0b0',
  105: '#d4b8f0',
  106: '#7ee8e8',
  107: '#ffffff',
};

// eslint-disable-next-line no-control-regex
const SGR_RE = /\u001b\[([0-9;]*)m/g;

export function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let style: React.CSSProperties = {};
  let lastIndex = 0;

  SGR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SGR_RE.exec(input)) !== null) {
    // Push text before this escape
    if (match.index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, match.index), style: { ...style } });
    }
    lastIndex = match.index + match[0].length;

    // Parse SGR codes
    const codes = match[1] ? match[1].split(';').map(Number) : [0];
    for (const code of codes) {
      if (code === 0) {
        style = {};
      } else if (code === 1) {
        style = { ...style, fontWeight: 'bold' };
      } else if (code === 2) {
        style = { ...style, opacity: 0.7 };
      } else if (code === 3) {
        style = { ...style, fontStyle: 'italic' };
      } else if (code === 4) {
        style = { ...style, textDecoration: 'underline' };
      } else if (code === 22) {
        const { fontWeight: _, ...rest } = style;
        style = rest;
      } else if (ANSI_COLORS[code]) {
        style = { ...style, color: ANSI_COLORS[code] };
      } else if (ANSI_BG_COLORS[code]) {
        style = { ...style, backgroundColor: ANSI_BG_COLORS[code] };
      } else if (code === 39) {
        const { color: _, ...rest } = style;
        style = rest;
      } else if (code === 49) {
        const { backgroundColor: _, ...rest } = style;
        style = rest;
      }
    }
  }

  // Push remaining text
  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), style: { ...style } });
  }

  return segments;
}
