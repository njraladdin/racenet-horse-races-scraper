const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createLogger, getConfig } = require('../utils');

// Create a module-specific logger
const logger = createLogger({ timestamps: true, debug: false });

/**
 * Parse selections data from an event
 * @param {Object} event - Raw event data from API
 * @param {string} eventId - Event ID for logging purposes
 * @returns {Object} Object containing parsed event details and selections
 */
function parseSelectionsData(event, eventId) {
  // Check if event is valid
  if (!event) {
    logger.error(`INVALID EVENT DATA for eventId: ${eventId} - Missing event object`);
    return { eventDetails: {}, selections: [] };
  }

  // Extract event details
  const eventDetails = {
    id: event.id,
    name: event.name,
    distance: event.distance,
    eventNumber: event.eventNumber,
    eventClass: event.eventClass,
    groupType: event.groupType,
    raceType: event.raceType,
    startTime: event.startTime,
    endTime: event.endTime,
    meetingId: event.meetingId,
    isResulted: event.isResulted,
    isAbandoned: event.isAbandoned,
    status: event.status,
    slug: event.slug,
    racePrizeMoneyUnit: event.racePrizeMoneyUnit,
    racePrizeMoneyValue: event.racePrizeMoneyValue,
    trackCondition: event.trackCondition,
    apprenticeCanClaim: event.apprenticeCanClaim,
    placeWinners: event.placeWinners,
    racePrizeMoney: event.racePrizeMoney, 
    resultState: event.resultState,
    starters: event.starters,
    winningTime: event.winningTime,
    pace: event.pace
  };

  // Parse the response to extract selections
  const selections = event.selections;

  if (!Array.isArray(selections)) {
    logger.warn(`No selections array found for eventId: ${eventId}`);
    saveDebugFile(event, `event_${eventId}_no_selections_debug.json`);
    return { eventDetails, selections: [] };
  }

  // Add diagnostic logging for understanding selection statuses
  if (selections.length > 0) {
    const statusCounts = {};
    selections.forEach(s => {
      const status = s.status || "NULL";
      if (!statusCounts[status]) statusCounts[status] = 0;
      statusCounts[status]++;
    });
    logger.info(`Selection status breakdown for eventId ${eventId}: ${JSON.stringify(statusCounts)}`);
    
    // If only scratched selections are present, save them for debugging
    const nonScratchedCount = Object.entries(statusCounts).reduce((count, [status, num]) => 
      status !== "SCRATCHED" ? count + num : count, 0);
    
    if (nonScratchedCount === 0) {
      saveDebugFile(event, `event_${eventId}_all_scratched_debug.json`);
    }
  }

  // Filter and map selections with additional diagnostics
  const selectionsWithCorrectType = selections.filter(selection => selection.__typename === "Selection");
  if (selectionsWithCorrectType.length < selections.length) {
    logger.info(`Filtered out ${selections.length - selectionsWithCorrectType.length} selections with wrong __typename`);
  }
  
  // In this specific application, we're including all horses now, not filtering by status
  const parsedSelections = selectionsWithCorrectType.map(selection => ({
    id: selection.id,
    status: selection.status,
    competitorNumber: selection.competitorNumber,
    barrierNumber: selection.barrierNumber,
    weight: selection.weight,
    startingPrice: selection.startingPrice,
    // Safely access nested competitor details
    competitorName: selection.competitor?.name,
    competitorAge: selection.competitor?.age,
    competitorSex: selection.competitor?.sex,
    sire: selection.competitor?.sire,
    dam: selection.competitor?.dam,
    // Safely access nested jockey details
    jockeyName: selection.jockey?.name,
    // Safely access nested trainer details
    trainerName: selection.trainer?.name,
  }));

  if (parsedSelections.length === 0) {
    logger.warn(`No selections found for eventId: ${eventId} after type filtering`);
    
    saveDebugFile({
      event,
      statusCounts: selectionsWithCorrectType.reduce((acc, s) => {
        const status = s.status || "NULL";
        if (!acc[status]) acc[status] = 0;
        acc[status]++;
        return acc;
      }, {}),
      filteringDetails: {
        originalCount: selections.length,
        afterTypeFilter: selectionsWithCorrectType.length,
        afterResultedFilter: 0,
        hasNullStatus: selectionsWithCorrectType.filter(s => s.status === null).length > 0,
        hasScratchedStatus: selectionsWithCorrectType.filter(s => s.status === "SCRATCHED").length > 0
      }
    }, `event_${eventId}_filtered_to_zero_debug.json`);
    
    return { eventDetails, selections: [] };
  }

  logger.success(`Found ${parsedSelections.length} valid selections for event ${eventId}`);
  
  return {
    eventDetails,
    selections: parsedSelections
  };
}

/**
 * Helper function to save debug files if enabled
 * @param {Object} data - Data to save
 * @param {string} filename - Filename to save to
 */
function saveDebugFile(data, filename) {
  // Only save debug files if SAVE_DEBUG_OUTPUT is true
  if (!getConfig('SAVE_DEBUG_OUTPUT')) {
    logger.debug(`Debug file saving is disabled (SAVE_DEBUG_OUTPUT=false)`);
    return;
  }
  
  // Create test_output directory if it doesn't exist
  const outputDir = path.join(process.cwd(), 'test_output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Save data to file
  const debugOutputFile = path.join(outputDir, filename);
  fs.writeFileSync(debugOutputFile, JSON.stringify(data, null, 2));
  logger.debug(`Debug data saved to ${debugOutputFile}`);
}

/**
 * Get selections for a specific event
 * @param {string} eventId - Event ID (e.g., "1925367")
 * @param {string} brand - Brand name (default: "punters")
 * @returns {Promise<Object>} Object containing raw response and parsed selections
 */
async function getSelectionsForAnEvent(eventId, brand = "punters") {
  // Create variables object that will be encoded
  const variables = {
    brand: brand,
    brandEnum: brand,
    eventId: eventId
  };

  // Create extensions object that will be encoded
  const extensions = {
    persistedQuery: {
      version: 1,
      sha256Hash: "1208f445f68dbd694b26c8d0e4d1cad7112e80f9e3bbc61d672de2610f261f94"
    }
  };

  // URL encode the JSON objects
  const encodedVariables = encodeURIComponent(JSON.stringify(variables));
  const encodedExtensions = encodeURIComponent(JSON.stringify(extensions));

  // Configure the request
  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `https://puntapi.com/racing?operationName=getEventById&variables=${encodedVariables}&extensions=${encodedExtensions}`,
    headers: { 
      'accept': '*/*', 
      'accept-language': 'en-US,en;q=0.9,be;q=0.8,ar;q=0.7', 
      'authorization': 'Bearer none', 
      'content-type': 'application/json', 
      'dnt': '1', 
      'origin': 'https://www.punters.com.au', 
      'priority': 'u=1, i', 
      'referer': 'https://www.punters.com.au/', 
      'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"', 
      'sec-ch-ua-mobile': '?0', 
      'sec-ch-ua-platform': '"Windows"', 
      'sec-fetch-dest': 'empty', 
      'sec-fetch-mode': 'cors', 
      'sec-fetch-site': 'cross-site', 
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
    }
  };

  try {
    logger.info(`Fetching selections for event ID: ${eventId}`);
    const response = await axios.request(config);
    const rawResponse = response.data;

    // Check for completely missing or invalid API response
    if (!rawResponse.data || !rawResponse.data.event) {
      logger.error(`INVALID API RESPONSE for eventId: ${eventId} - Missing data structure`);
      saveDebugFile(rawResponse, `event_${eventId}_invalid_response_debug.json`);
      return { 
        rawResponse, 
        parsedData: { eventDetails: {}, selections: [] } 
      };
    }

    // Parse the event data
    const event = rawResponse.data.event;
    const parsedData = parseSelectionsData(event, eventId);

    // Save debug files if enabled
    if (getConfig('SAVE_DEBUG_OUTPUT')) {
      // Save both raw and parsed data to files
      saveDebugFile(rawResponse, `event_selections_${eventId}_raw.json`);
      saveDebugFile(parsedData, `event_selections_${eventId}_parsed.json`);
    }

    // Return both raw response and parsed data
    return {
      rawResponse,
      parsedData
    };

  } catch (error) {
    logger.error('Error fetching or parsing selections data:', error);
    throw error;
  }
}

// Export both functions
module.exports = {
  getSelectionsForAnEvent,
  parseSelectionsData
};

// Test function
const test = async () => {
  try {
    const { parsedData } = await getSelectionsForAnEvent("1929168");
    logger.info('Parsed Data:');
    logger.info(JSON.stringify(parsedData, null, 2));
  } catch (error) {
    logger.error('Test function failed:', error);
  }
}

// Only run the test function if this file is being run directly, not when imported
if (require.main === module) {
  test();
} 