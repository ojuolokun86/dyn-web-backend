// Hall of Fame achievement counting helpers.
// The player's induction history lives in the `hall_of_fame_web` table, one row
// per (league, season, team) win. The count used in emails is derived from that
// history instead of a per-row snapshot so it stays correct over time.

const HALL_OF_FAME_TABLE = 'hall_of_fame_web';

// Player names are typed by admins, so compare them case/whitespace insensitively
function normalizeText(value) {
    return String(value === null || value === undefined ? '' : value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

// Identity of a single trophy: same league + season + team is the same win
function achievementKey(entry) {
    return [entry.league, entry.season, entry.team_name].map(normalizeText).join('|');
}

function isSamePlayer(entry, playerName) {
    return normalizeText(entry.player_name) === normalizeText(playerName);
}

// Chronological order of inductions, tie-broken by id for stable ranking
function compareEntries(a, b) {
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return String(a.id || '').localeCompare(String(b.id || ''));
}

async function fetchPlayerInductions(db, playerName) {
    const { data, error } = await db
        .from(HALL_OF_FAME_TABLE)
        .select('id, player_name, league, team_name, season, created_at');

    if (error) throw error;

    return (data || []).filter(entry => isSamePlayer(entry, playerName)).sort(compareEntries);
}

// Total Hall of Fame inductions for a player, counting every distinct trophy in
// their history (duplicated rows for the same league/season/team count once).
// When `upTo` is given, only inductions up to and including that entry count, so
// a resent email reports the ordinal the player had at that induction.
async function countPlayerInductions(db, playerName, options = {}) {
    const { upTo } = options;

    let inductions = await fetchPlayerInductions(db, playerName);

    if (upTo) {
        inductions = inductions.filter(entry => compareEntries(entry, upTo) <= 0);
        if (!inductions.some(entry => entry.id === upTo.id)) {
            inductions.push(upTo);
        }
    }

    const uniqueAchievements = new Set(inductions.map(achievementKey));

    // A player with no stored history is still receiving their first induction
    return Math.max(uniqueAchievements.size, 1);
}

module.exports = {
    HALL_OF_FAME_TABLE,
    normalizeText,
    achievementKey,
    countPlayerInductions,
    fetchPlayerInductions
};
