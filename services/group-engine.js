'use strict';

/**
 * Group distribution and round-robin generation for group stage tournaments.
 */

/**
 * Distribute participants into groups.
 * Participants: array of {id, name, team_name}
 * Group count: number of groups
 * Seeding: optional array of seed priorities
 * Returns: array of groups with members
 */
function distributeIntoGroups(participants, groupCount, seeding = null) {
  if (groupCount < 1) throw new Error('Group count must be at least 1');
  if (!participants || participants.length < groupCount) {
    throw new Error(`At least ${groupCount} participants required for ${groupCount} groups`);
  }

  const unique = new Map();
  for (const participant of participants) {
    const normalized = {
      id: participant.id,
      name: String(participant.name || participant.participant_name || '').trim(),
      team_name: String(participant.team_name || '').trim() || null
    };
    if (!normalized.id || !normalized.name || unique.has(normalized.id)) continue;
    unique.set(normalized.id, normalized);
  }

  const entries = Array.from(unique.values());

  // Sort by seeding if provided, otherwise maintain order
  if (seeding && seeding.length > 0) {
    entries.sort((a, b) => {
      const aIdx = seeding.indexOf(a.id);
      const bIdx = seeding.indexOf(b.id);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }

  // Distribute serpentine (snake draft pattern)
  const groups = Array.from({ length: groupCount }, (_, i) => ({ number: i + 1, members: [] }));

  for (let i = 0; i < entries.length; i++) {
    const groupIdx = i % groupCount;
    groups[groupIdx].members.push({ ...entries[i], seed: Math.floor(i / groupCount) + 1 });
  }

  return groups;
}

module.exports = { distributeIntoGroups };
