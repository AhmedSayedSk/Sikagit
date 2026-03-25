import type { GitCommit, GraphCommit, GraphConnection } from '@sikagit/shared';

const NUM_COLORS = 8;

/**
 * Assigns lanes (columns) to commits and computes connections between them.
 * Mimics the Sourcetree/GitKraken style graph.
 *
 * Algorithm:
 * - Process commits in topological order (newest first)
 * - Maintain a set of "active lanes" — each lane tracks which commit hash it expects next
 * - When a commit arrives, find its reserved lane (or assign a new one)
 * - For each parent: if it's the first parent, keep it on the same lane (straight line)
 *   otherwise, assign/find a lane for it (merge-in or branch-out)
 */
export function computeGraph(commits: GitCommit[]): { commits: GraphCommit[]; totalLanes: number } {
  if (commits.length === 0) return { commits: [], totalLanes: 0 };

  // activeLanes[i] = hash that lane i is waiting for, or null if lane is free
  const activeLanes: (string | null)[] = [];
  // Map from commit hash to its assigned lane
  const commitLaneMap = new Map<string, number>();
  // Map from commit hash to its row index
  const commitRowMap = new Map<string, number>();
  // Map from lane index to color
  const laneColors = new Map<number, number>();
  // Track lanes created by branch divergence (NOT merge parents).
  // These lanes draw a fork-out at the ancestor instead of a merge-in.
  const branchLanes = new Set<number>();
  let nextColor = 0;

  const graphCommits: GraphCommit[] = [];

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];
    commitRowMap.set(commit.hash, row);

    // Find which lane this commit was expected on
    let lane = activeLanes.indexOf(commit.hash);

    if (lane === -1) {
      // Not expected on any lane — this commit is on a side branch.
      // Check if any of this commit's parents are already expected on a lane.
      const parentOnLane = commit.parentHashes
        .map(ph => activeLanes.indexOf(ph))
        .find(idx => idx !== -1);

      if (parentOnLane !== undefined && parentOnLane !== -1) {
        // Parent is already reserved on a lane by another commit (the main lineage).
        // This commit must be on a DIFFERENT branch — give it a new lane.
        lane = getFreeLane(activeLanes);
        branchLanes.add(lane);
      } else {
        lane = getFreeLane(activeLanes);
      }
    }

    // Claim this lane
    activeLanes[lane] = null;
    commitLaneMap.set(commit.hash, lane);

    // Assign a color to this lane if it doesn't have one
    if (!laneColors.has(lane)) {
      laneColors.set(lane, nextColor % NUM_COLORS);
      nextColor++;
    }

    const connections: GraphConnection[] = [];
    const laneColor = laneColors.get(lane)!;

    // Track lanes that existed before this row (for carry-forward)
    const lanesBeforeRow = new Set<number>();
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] !== null && i !== lane) {
        lanesBeforeRow.add(i);
      }
    }

    // Close any other lanes that were waiting for this same commit
    for (let i = 0; i < activeLanes.length; i++) {
      if (i !== lane && activeLanes[i] === commit.hash) {
        if (branchLanes.has(i)) {
          // This is a branch lane (unmerged fork).
          // Draw a fork-out curve FROM this commit's lane OUT to the branch lane.
          // This shows the branch originating from this commit (the fork point).
          connections.push({
            fromLane: lane,
            toLane: i,
            fromRow: row,
            toRow: row - 1,
            type: 'branch-out',
            colorIndex: laneColors.get(i) ?? laneColor,
          });
          // Remove the carry-forward straight line from previous row on the branch lane
          // (the fork-out curve replaces the last segment)
          if (row > 0) {
            const prevCommit = graphCommits[row - 1];
            prevCommit.connections = prevCommit.connections.filter(c =>
              !(c.fromLane === i && c.toLane === i && c.type === 'straight' && c.toRow === row)
            );
          }
          branchLanes.delete(i);
        } else {
          // This is a merge lane — draw a merge-in curve
          connections.push({
            fromLane: i,
            toLane: lane,
            fromRow: row - 1,
            toRow: row,
            type: 'merge-in',
            colorIndex: laneColors.get(i) ?? laneColor,
          });
          if (row > 0) {
            const prevCommit = graphCommits[row - 1];
            prevCommit.connections = prevCommit.connections.filter(c =>
              !(c.fromLane === i && c.toLane === i && c.type === 'straight' && c.toRow === row)
            );
          }
        }
        activeLanes[i] = null;
        lanesBeforeRow.delete(i);
      }
    }

    // Process parents
    const parents = commit.parentHashes;

    if (parents.length >= 1) {
      const firstParent = parents[0];

      // First parent stays on this lane (straight line)
      activeLanes[lane] = firstParent;

      connections.push({
        fromLane: lane,
        toLane: lane,
        fromRow: row,
        toRow: row + 1,
        type: 'straight',
        colorIndex: laneColor,
      });

      // Additional parents = merge sources
      for (let p = 1; p < parents.length; p++) {
        const parentHash = parents[p];

        // Check if this parent is already expected on some lane
        let parentLane = activeLanes.indexOf(parentHash);

        if (parentLane === -1) {
          // Assign parent to a new lane (this is a merge lane, NOT a branch lane)
          parentLane = getFreeLane(activeLanes);
          activeLanes[parentLane] = parentHash;

          if (!laneColors.has(parentLane)) {
            laneColors.set(parentLane, nextColor % NUM_COLORS);
            nextColor++;
          }
        }

        connections.push({
          fromLane: lane,
          toLane: parentLane,
          fromRow: row,
          toRow: row + 1,
          type: 'merge-in',
          colorIndex: laneColors.get(parentLane) ?? laneColor,
        });
      }
    }

    // Carry forward only lanes that existed before this row
    for (const i of lanesBeforeRow) {
      if (activeLanes[i] !== null) {
        connections.push({
          fromLane: i,
          toLane: i,
          fromRow: row,
          toRow: row + 1,
          type: 'straight',
          colorIndex: laneColors.get(i) ?? 0,
        });
      }
    }

    graphCommits.push({
      ...commit,
      lane,
      laneColor,
      connections,
    });
  }

  const totalLanes = activeLanes.length;
  return { commits: graphCommits, totalLanes };
}

function getFreeLane(lanes: (string | null)[]): number {
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] === null) return i;
  }
  lanes.push(null);
  return lanes.length - 1;
}
