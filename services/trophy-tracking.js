const db = require('../config/db');

function normalizePlayerName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function getEventForAward(awardedAt) {
  const { data: events, error } = await db
    .from('events')
    .select('id, created_at, ended_at, status')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const awardDate = new Date(awardedAt);
  const endedEvents = (events || [])
    .filter(event => event.ended_at)
    .sort((left, right) => new Date(left.ended_at) - new Date(right.ended_at));
  let previousEnd = null;

  for (const event of endedEvents) {
    const periodStart = previousEnd ? new Date(previousEnd) : new Date(event.created_at);
    if (awardDate > periodStart && awardDate <= new Date(event.ended_at)) return event;
    previousEnd = event.ended_at;
  }

  const lastEndedEvent = endedEvents[endedEvents.length - 1];
  const activeEvents = (events || [])
    .filter(event => ['draft', 'open'].includes(event.status))
    .filter(event => !lastEndedEvent || new Date(event.created_at) > new Date(lastEndedEvent.created_at))
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
  return activeEvents.find(event =>
    lastEndedEvent
      ? awardDate > new Date(lastEndedEvent.ended_at)
      : awardDate >= new Date(event.created_at)
  ) || null;
}

async function recalculateContenderPoints(contenderId) {
  const [voteResult, pointResult] = await Promise.all([
    db.from('contender_vote_records').select('points_awarded').eq('contender_id', contenderId),
    db.from('contender_point_records').select('points_awarded').eq('contender_id', contenderId)
  ]);
  if (voteResult.error) throw voteResult.error;
  if (pointResult.error) throw pointResult.error;

  const total = [...(voteResult.data || []), ...(pointResult.data || [])]
    .reduce((sum, record) => sum + Number(record.points_awarded || 0), 0);
  const { error: updateError } = await db
    .from('contenders')
    .update({ total_points: total })
    .eq('id', contenderId);
  if (updateError) throw updateError;
}

async function deleteLinkedPointRecord(record) {
  const { error } = await db
    .from('contender_point_records')
    .delete()
    .eq('id', record.id);
  if (error) throw error;
  await recalculateContenderPoints(record.contender_id);
}

async function getContenderForEntry(entry, eventId) {
  if (entry.profile_id) {
    const { data, error } = await db
      .from('contenders')
      .select('id, profile_id, name')
      .eq('event_id', eventId)
      .eq('profile_id', entry.profile_id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;

    const { data: sameNameContenders, error: nameError } = await db
      .from('contenders')
      .select('id, profile_id, name')
      .eq('event_id', eventId);
    if (nameError) throw nameError;
    const unlinkedMatches = (sameNameContenders || []).filter(contender =>
      !contender.profile_id &&
      normalizePlayerName(contender.name) === normalizePlayerName(entry.player_name)
    );
    if (unlinkedMatches.length > 1) {
      throw new Error(`More than one unlinked contender named "${entry.player_name}" exists in event ${eventId}; link the Hall of Fame entry to the correct player profile.`);
    }
    if (unlinkedMatches.length === 1) {
      const { error: linkError } = await db
        .from('contenders')
        .update({ profile_id: entry.profile_id })
        .eq('id', unlinkedMatches[0].id);
      if (linkError) throw linkError;
      return { ...unlinkedMatches[0], profile_id: entry.profile_id };
    }
    return null;
  }

  const { data: contenders, error } = await db
    .from('contenders')
    .select('id, profile_id, name')
    .eq('event_id', eventId);
  if (error) throw error;

  const matching = (contenders || []).filter(contender =>
    normalizePlayerName(contender.name) === normalizePlayerName(entry.player_name)
  );
  if (matching.length > 1) {
    throw new Error(`More than one contender named "${entry.player_name}" exists in event ${eventId}; link the Hall of Fame entry to the correct player profile.`);
  }
  return matching[0] || null;
}

async function getOrCreateEventPointTable(eventId, category) {
  const { data: existing, error: findError } = await db
    .from('point_tables')
    .select('id, default_points')
    .eq('event_id', eventId)
    .eq('trophy_category_id', category.id)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing;

  const title = `${category.name} Trophy Awards`;
  const { data: existingByTitle, error: titleError } = await db
    .from('point_tables')
    .select('id')
    .eq('event_id', eventId)
    .eq('title', title)
    .maybeSingle();
  if (titleError) throw titleError;
  if (existingByTitle) {
    const { data, error } = await db
      .from('point_tables')
      .update({ trophy_category_id: category.id, default_points: category.points })
      .eq('id', existingByTitle.id)
      .select('id, default_points')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db
    .from('point_tables')
    .insert({
      event_id: eventId,
      title,
      default_points: category.points,
      trophy_category_id: category.id
    })
    .select('id, default_points')
    .single();
  if (error) throw error;
  return data;
}

async function syncHallOfFameEntry(entryId) {
  const { data: entry, error: entryError } = await db
    .from('hall_of_fame_web')
    .select('*')
    .eq('id', entryId)
    .single();
  if (entryError) throw entryError;

  let eventId = entry.event_id;
  if (!eventId) {
    const awardDate = entry.awarded_at || entry.created_at || new Date().toISOString();
    const event = await getEventForAward(awardDate);
    if (event) {
      eventId = event.id;
      const { error: assignError } = await db
        .from('hall_of_fame_web')
        .update({ event_id: eventId })
        .eq('id', entry.id);
      if (assignError) throw assignError;
    }
  }

  const { data: linkedRecord, error: recordError } = await db
    .from('contender_point_records')
    .select('*')
    .eq('hall_of_fame_entry_id', entry.id)
    .maybeSingle();
  if (recordError) throw recordError;

  if (!eventId) {
    if (linkedRecord) await deleteLinkedPointRecord(linkedRecord);
    return { eventId: null, pointsAwarded: false };
  }

  const { data: category, error: categoryError } = await db
    .from('trophy_categories')
    .select('id, name, points')
    .eq('name', entry.league)
    .single();
  if (categoryError) throw categoryError;

  const contender = await getContenderForEntry(entry, eventId);
  if (!contender) {
    if (linkedRecord) await deleteLinkedPointRecord(linkedRecord);
    return { eventId, pointsAwarded: false };
  }

  const pointTable = await getOrCreateEventPointTable(eventId, category);
  const points = Number(category.points);

  if (linkedRecord && linkedRecord.contender_id === contender.id && linkedRecord.event_id === eventId) {
    const { error: updateError } = await db
      .from('contender_point_records')
      .update({
        point_table_id: pointTable.id,
        points_awarded: points,
        note: `Hall of Fame achievement: ${entry.league}`
      })
      .eq('id', linkedRecord.id);
    if (updateError) throw updateError;
    await recalculateContenderPoints(contender.id);
  } else {
    if (linkedRecord) await deleteLinkedPointRecord(linkedRecord);
    const { error: insertError } = await db
      .from('contender_point_records')
      .insert({
        contender_id: contender.id,
        event_id: eventId,
        point_table_id: pointTable.id,
        hall_of_fame_entry_id: entry.id,
        points_awarded: points,
        awarded_at: entry.awarded_at || new Date().toISOString(),
        note: `Hall of Fame achievement: ${entry.league}`
      });
    if (insertError) throw insertError;
    await recalculateContenderPoints(contender.id);
  }

  return { eventId, pointsAwarded: true, points };
}

async function assignPendingEntriesToEvent(event) {
  const { data: endedEvents, error: endedError } = await db
    .from('events')
    .select('id, ended_at')
    .not('ended_at', 'is', null)
    .lte('ended_at', event.created_at)
    .order('ended_at', { ascending: false })
    .limit(1);
  if (endedError) throw endedError;
  const previousEnd = endedEvents?.[0]?.ended_at || event.created_at;

  const { data: pendingEntries, error: entriesError } = await db
    .from('hall_of_fame_web')
    .select('id, awarded_at, created_at')
    .is('event_id', null);
  if (entriesError) throw entriesError;

  const eligibleEntries = (pendingEntries || []).filter(entry => {
    const awardedAt = entry.awarded_at || entry.created_at;
    return awardedAt && new Date(awardedAt) > new Date(previousEnd);
  });

  const issues = [];
  let assigned = 0;
  let scored = 0;
  let pending = 0;
  for (const entry of eligibleEntries) {
    try {
      const { error: assignError } = await db
        .from('hall_of_fame_web')
        .update({ event_id: event.id })
        .eq('id', entry.id)
        .is('event_id', null);
      if (assignError) throw assignError;
      assigned++;
      const result = await syncHallOfFameEntry(entry.id);
      if (result.pointsAwarded) scored++;
      else pending++;
    } catch (error) {
      issues.push({ entryId: entry.id, error: error.message });
    }
  }
  return { entriesFound: eligibleEntries.length, entriesAssigned: assigned, entriesScored: scored, entriesPending: pending, issues };
}

async function syncEntriesForContender(contender) {
  const { data: entries, error } = await db
    .from('hall_of_fame_web')
    .select('id, profile_id, player_name')
    .eq('event_id', contender.event_id);
  if (error) throw error;

  const matches = (entries || []).filter(entry =>
    contender.profile_id && entry.profile_id
      ? entry.profile_id === contender.profile_id
      : normalizePlayerName(entry.player_name) === normalizePlayerName(contender.name)
  );
  const issues = [];
  let scored = 0;
  for (const entry of matches) {
    try {
      const result = await syncHallOfFameEntry(entry.id);
      if (result.pointsAwarded) scored++;
    } catch (syncError) {
      issues.push({ entryId: entry.id, error: syncError.message });
    }
  }
  return { entriesFound: matches.length, entriesScored: scored, issues };
}

async function removeHallOfFameEntryPoints(entryId) {
  const { data: record, error } = await db
    .from('contender_point_records')
    .select('*')
    .eq('hall_of_fame_entry_id', entryId)
    .maybeSingle();
  if (error) throw error;
  if (record) await deleteLinkedPointRecord(record);
}

async function reconcileTrophyHistory() {
  const { data: events, error: eventsError } = await db
    .from('events')
    .select('id, created_at, ended_at, status')
    .order('created_at', { ascending: true });
  if (eventsError) throw eventsError;

  const { data: entries, error: entriesError } = await db
    .from('hall_of_fame_web')
    .select('id, awarded_at, created_at, event_id')
    .order('created_at', { ascending: true });
  if (entriesError) throw entriesError;

  const endedEvents = (events || [])
    .filter(event => event.ended_at)
    .sort((left, right) => new Date(left.ended_at) - new Date(right.ended_at));
  const activeEvents = (events || []).filter(event => ['draft', 'open'].includes(event.status));
  const issues = [];
  let assigned = 0;
  let newlyAssigned = 0;
  let scored = 0;
  let pending = 0;

  for (const entry of entries || []) {
    const awardedAt = new Date(entry.awarded_at || entry.created_at);
    let targetEvent = null;
    let previousEnd = null;

    for (const event of endedEvents) {
      const periodStart = previousEnd ? new Date(previousEnd) : new Date(event.created_at);
      const eventEnd = new Date(event.ended_at);
      if (awardedAt > periodStart && awardedAt <= eventEnd) {
        targetEvent = event;
        break;
      }
      previousEnd = event.ended_at;
    }

    if (!targetEvent) {
      const lastEndedEvent = endedEvents[endedEvents.length - 1];
      const periodStart = lastEndedEvent
        ? new Date(lastEndedEvent.ended_at)
        : null;
      targetEvent = activeEvents
        .filter(event => !periodStart || new Date(event.created_at) > new Date(lastEndedEvent.created_at))
        .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
        .find(event => periodStart
          ? awardedAt > periodStart
          : awardedAt >= new Date(event.created_at)) || null;
    }

    if ((targetEvent?.id || null) !== (entry.event_id || null)) {
      const { error: assignmentError } = await db
        .from('hall_of_fame_web')
        .update({ event_id: targetEvent?.id || null })
        .eq('id', entry.id);
      if (assignmentError) {
        issues.push({ entryId: entry.id, error: assignmentError.message });
        continue;
      }
      if (targetEvent) newlyAssigned++;
    }
    if (targetEvent) assigned++;

    try {
      const result = await syncHallOfFameEntry(entry.id);
      if (result.pointsAwarded) scored++;
      else pending++;
    } catch (error) {
      issues.push({ entryId: entry.id, error: error.message });
    }
  }

  return {
    entriesProcessed: (entries || []).length,
    entriesAssigned: assigned,
    entriesNewlyAssigned: newlyAssigned,
    entriesScored: scored,
    entriesPending: pending,
    issues
  };
}

module.exports = {
  assignPendingEntriesToEvent,
  syncEntriesForContender,
  syncHallOfFameEntry,
  removeHallOfFameEntryPoints,
  reconcileTrophyHistory
};
