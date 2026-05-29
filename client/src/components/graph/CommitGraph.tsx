import type { GraphCommit, GraphConnection } from '@sikagit/shared';

const ROW_HEIGHT = 28;
const LANE_WIDTH = 14;
const NODE_RADIUS = 4;
const PADDING_LEFT = 8;

const LANE_COLORS = [
  '#7ba4f7', // blue
  '#6bcf7f', // green
  '#d4a84a', // yellow
  '#ef6f6f', // red
  '#b88cf5', // purple
  '#e88ab8', // pink
  '#5ccfd6', // cyan
  '#d4854a', // orange
];

function getColor(colorIndex: number): string {
  return LANE_COLORS[colorIndex % LANE_COLORS.length];
}

function laneX(lane: number): number {
  return PADDING_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
}

function rowY(row: number): number {
  return row * ROW_HEIGHT + ROW_HEIGHT / 2;
}

interface CommitGraphProps {
  commits: GraphCommit[];
  totalLanes: number;
  startIndex: number;
  endIndex: number;
  scrollOffset: number;
  hasUncommitted?: boolean;
}

export function CommitGraph({ commits, totalLanes, startIndex, endIndex, scrollOffset, hasUncommitted }: CommitGraphProps) {
  const width = PADDING_LEFT + Math.max(totalLanes, 1) * LANE_WIDTH + PADDING_LEFT;
  const visibleCommits = commits.slice(startIndex, endIndex);

  // We need extra rows above/below for connections that span into visible area
  const extraBefore = Math.max(0, startIndex - 1);
  const extraAfter = Math.min(commits.length, endIndex + 1);

  // Uncommitted-changes line must anchor to HEAD — the parent of any new
  // commit. commits[0] is just whatever sits on top of the log (often a
  // newer commit on a different branch), which is not where new work lands.
  const headIndex = commits.findIndex(c => c.isHead);
  const headCommit = headIndex >= 0 ? commits[headIndex] : commits[0];
  const headRow = headIndex >= 0 ? headIndex : 0;

  return (
    <svg
      width={width}
      height={(endIndex - startIndex) * ROW_HEIGHT}
      style={{
        position: 'absolute',
        top: startIndex * ROW_HEIGHT,
        left: 0,
      }}
    >
      <g transform={`translate(0, ${-startIndex * ROW_HEIGHT})`}>
        {/* Line from uncommitted row down to the HEAD commit's circle */}
        {hasUncommitted && startIndex === 0 && headCommit && (
          <line
            x1={laneX(headCommit.lane)}
            y1={0}
            x2={laneX(headCommit.lane)}
            y2={rowY(headRow)}
            stroke={getColor(headCommit.laneColor)}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}

        {/* Render connections for visible rows + a bit of context */}
        {commits.slice(extraBefore, extraAfter).map((commit, _i) => {
          const row = extraBefore + _i;
          return commit.connections.map((conn, ci) => (
            <ConnectionLine
              key={`${commit.hash}-${ci}`}
              conn={conn}
              row={row}
            />
          ));
        })}

        {/* Render nodes for visible rows */}
        {visibleCommits.map((commit, i) => {
          const row = startIndex + i;
          return (
            <CommitNode
              key={commit.hash}
              x={laneX(commit.lane)}
              y={rowY(row)}
              color={getColor(commit.laneColor)}
              isHead={commit.isHead}
              isMerge={commit.parentHashes.length > 1}
            />
          );
        })}
      </g>
    </svg>
  );
}

function ConnectionLine({ conn, row }: { conn: GraphConnection; row: number }) {
  const color = getColor(conn.colorIndex);
  const fromX = laneX(conn.fromLane);
  const toX = laneX(conn.toLane);
  const fromY = rowY(conn.fromRow);
  const toY = rowY(conn.toRow);

  if (conn.type === 'straight' && conn.fromLane === conn.toLane) {
    // Simple vertical line
    return (
      <line
        x1={fromX}
        y1={fromY}
        x2={toX}
        y2={toY}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    );
  }

  if ((conn.type === 'merge-in') && conn.fromRow === conn.toRow) {
    // Horizontal merge into node (same row)
    return (
      <line
        x1={fromX}
        y1={fromY}
        x2={toX}
        y2={toY}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    );
  }

  // Curved connection (merge-in or branch-out across rows) — smooth S-curve
  const dy = toY - fromY;
  const d = `M ${fromX} ${fromY} C ${fromX} ${fromY + dy * 0.8}, ${toX} ${toY - dy * 0.8}, ${toX} ${toY}`;

  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
}

function CommitNode({
  x,
  y,
  color,
  isHead,
  isMerge,
}: {
  x: number;
  y: number;
  color: string;
  isHead: boolean;
  isMerge: boolean;
}) {
  const r = isHead ? NODE_RADIUS + 1 : isMerge ? NODE_RADIUS + 1 : NODE_RADIUS;

  return (
    <>
      {/* Water-droplet ripples for HEAD (last checked-out commit) */}
      {isHead && [0, 1.75].map(i => (
        <circle
          key={`ripple-${i}`}
          cx={x}
          cy={y}
          r={r + 2}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0}
        >
          <animate
            attributeName="r"
            from={r + 2}
            to={r + 12}
            dur="3.5s"
            begin={`${i}s`}
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.2 0.6 0.4 1"
          />
          <animate
            attributeName="opacity"
            from="0.9"
            to="0"
            dur="3.5s"
            begin={`${i}s`}
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.2 0.6 0.4 1"
          />
          <animate
            attributeName="stroke-width"
            from="2"
            to="0.4"
            dur="3.5s"
            begin={`${i}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
      {/* Outer ring for HEAD (double-circle design) */}
      {isHead && (
        <circle
          cx={x}
          cy={y}
          r={r + 4}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      )}
      {/* Main node */}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={!isMerge && !isHead ? '#1e2036' : color}
        stroke={color}
        strokeWidth={2}
      />
    </>
  );
}

/** Calculate the pixel width needed for the graph column */
export function getGraphWidth(totalLanes: number): number {
  return PADDING_LEFT + Math.max(totalLanes, 1) * LANE_WIDTH + PADDING_LEFT;
}

/** Render an uncommitted changes node (hollow circle) with a line going down */
export function UncommittedNode({ lane, colorIndex, width }: { lane: number; colorIndex: number; width: number }) {
  const x = laneX(lane);
  const cy = ROW_HEIGHT / 2;
  const color = getColor(colorIndex);
  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      {/* Line from circle down to bottom edge */}
      <line
        x1={x} y1={cy + NODE_RADIUS}
        x2={x} y2={ROW_HEIGHT}
        stroke={color} strokeWidth={2} strokeLinecap="round"
      />
      {/* Hollow circle */}
      <circle
        cx={x} cy={cy} r={NODE_RADIUS}
        fill="var(--color-bg-primary)"
        stroke={color} strokeWidth={2}
      />
    </svg>
  );
}
