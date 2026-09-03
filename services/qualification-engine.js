'use strict';

/**
 * Qualification logic for transitioning from group/league stages to knockout.
 */

/**
 * Generate qualifications from standings.
 * Standings: array of sorted {registration_id, rank, ...}
 * Qualification bands: array of {band, from_rank, to_rank, stage, status}
 * Returns: array of {registration_id, source_position, qualification_band, destination_stage, status}
 */
function generateQualifications(standings, qualificationBands) {
  if (!qualificationBands || qualificationBands.length === 0) {
    // Default: all qualified to knockout
    return standings.map((row, index) => ({
      registration_id: row.registration_id,
      source_position: row.rank,
      qualification_band: 'direct',
      destination_stage: 'knockout',
      status: 'qualified'
    }));
  }

  const qualifications = [];
    const coveredRanks = new Set();
    for (const band of qualificationBands) {
      if (!Number.isInteger(band.from_rank) || !Number.isInteger(band.to_rank) || band.from_rank < 1 || band.to_rank < band.from_rank) throw new Error('Qualification bands must contain valid rank ranges');
      for (let rank = band.from_rank; rank <= band.to_rank; rank++) {
        if (coveredRanks.has(rank)) throw new Error('Qualification bands cannot overlap');
        coveredRanks.add(rank);
      }
    }

  for (const row of standings) {
    const rank = row.rank || 0;

    for (const band of qualificationBands) {
      if (rank >= band.from_rank && rank <= band.to_rank) {
        qualifications.push({
          registration_id: row.registration_id,
          source_position: rank,
          qualification_band: band.band,
          destination_stage: band.destination_stage,
          status: band.status
        });
        break;
      }
    }
  }

  return qualifications;
}

module.exports = { generateQualifications };
