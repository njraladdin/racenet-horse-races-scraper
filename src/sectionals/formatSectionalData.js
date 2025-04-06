const fs = require('fs');
const path = require('path');
const { convertToCsv, createLogger } = require('../utils');

// Create a module-specific logger
const logger = createLogger({ timestamps: true, debug: false });

/**
 * Format sectional data into a standardized structure
 * @param {Object} results - Results object from getSectionals
 * @returns {Array} Formatted sectional data array
 */
const formatSectionalData = (results) => {
  // Format the data
  const formattedData = [];
  
  // Extract meeting info
  const meeting = results.meeting;
  
  // Process each selection
  Object.values(results.selections).forEach(selection => {
    // Get the associated event
    const event = results.events[selection.eventId];
    
    if (!selection.sectionals || !event) return;
    
    // Process each sectional record for this selection
    selection.sectionals.forEach(sectional => {
      // Create a flattened object with all relevant data
      const formattedRecord = {
        // Meeting info (current meeting, not directly relevant to historical data)
        // meetingId: meeting.id,
        // meetingName: meeting.name,
        // meetingDate: meeting.date,
        // meetingVenue: meeting.venue?.name,
        // meetingState: meeting.venue?.state,
        
        // Event info (current event, not directly relevant to historical data)
        // eventId: event.id,
        // eventNumber: event.eventNumber,
        // eventName: event.details?.name,
        // eventDistance: event.details?.distance,
        // eventClass: event.details?.eventClass,
        // eventTrackCondition: event.details?.trackCondition?.overall,
        // eventTrackRating: event.details?.trackCondition?.rating,
        // eventSurface: event.details?.trackCondition?.surface,
        // eventWinningTime: event.details?.winningTime,
        
        eventUrl: `${meeting.url}${event.slug}`,
        
        // Selection info (horse from current meeting/event)
        selectionId: selection.id, 
        horseNumber: selection.competitorNumber,
        horseName: selection.competitorName,
        // horseAge: selection.competitorAge,
        // horseSex: selection.competitorSex,
        // horseSire: selection.sire,
     //   horseDam: selection.dam,
        // jockeyName: selection.jockeyName,
        // trainerName: selection.trainerName,
        // weight: selection.weight,
        // barrier: selection.barrierNumber,
        
        // Historical sectional info (from past races)
        historicalRaceId: sectional.raceId,
        historicalMeetingDate: sectional.meetingDate,
        historicalEventName: sectional.eventNameForm,
        historicalVenue: sectional.venueName,
        historicalRaceTime: sectional.finishTime,
        historicalAverageTime: sectional.sectionalTimeSummary?.averageTime,
        
        // Sectional times
        last800Split: sectional.sectionalTime?.last800?.split,
        last800Speed: sectional.sectionalTime?.last800?.speed,
        last600Split: sectional.sectionalTime?.last600?.split,
        last600Speed: sectional.sectionalTime?.last600?.speed,
        last400Split: sectional.sectionalTime?.last400?.split,
        last400Speed: sectional.sectionalTime?.last400?.speed,
        last200Split: sectional.sectionalTime?.last200?.split,
        last200Speed: sectional.sectionalTime?.last200?.speed,
        finishSplit: sectional.sectionalTime?.finish?.split,
        finishSpeed: sectional.sectionalTime?.finish?.speed,
      };
      
      formattedData.push(formattedRecord);
    });
  });
  
  // Return early if no data
  if (!formattedData || formattedData.length === 0) {
    logger.warn('No formatted data available');
    return [];
  }
  
  logger.success(`Formatted ${formattedData.length} records`);
  
  return formattedData;
};

module.exports = formatSectionalData; 