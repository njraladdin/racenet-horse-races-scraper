const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createLogger, getConfig } = require('../utils');

// Create a module-specific logger
const logger = createLogger({ timestamps: true, debug: false });

/**
 * Parse forms data for selections
 * @param {Object} data - Raw data from API
 * @param {Array} selectionIds - Selection IDs for logging purposes
 * @returns {Object} Object containing parsed forms data
 */
function parseFormsData(data, selectionIds) {
  logger.info(`Parsing forms data for ${selectionIds.length} selections`);
  
  if (!data || !data.data) {
    logger.error(`INVALID API RESPONSE for selections: ${selectionIds.join(', ')} - Missing data structure`);
    return { forms: [] };
  }
  
  // Use the parseCompetitorForms function to parse the data
  const parsedForms = parseCompetitorForms(data);
  
  // Return the parsed forms in the expected structure
  return {
    forms: parsedForms
  };
}

/**
 * Parse competitor forms into a structured format
 * @param {Object} jsonData - Raw JSON data from API
 * @returns {Array} Array of parsed form entries
 */
const parseCompetitorForms = (jsonData) => {
  // Ensure jsonData is an object (parse if it's a string)
  if (typeof jsonData === 'string') {
    try {
      jsonData = JSON.parse(jsonData);
    } catch (error) {
      logger.error("Error parsing JSON string:", error);
      return []; // Return empty array on parse error
    }
  }

  if (!jsonData || !jsonData.data || !Array.isArray(jsonData.data.competitorForms)) {
    logger.error("Invalid input JSON structure.");
    return [];
  }

  const results = [];

  // Helper function to format date YYYY-MM-DD to DD/MM/YYYY
  const formatDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return '';
    }
    try {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    } catch (e) {
      return ''; // Handle potential split errors
    }
  };

  // Helper function to get position text at a specific distance
  const getPositionAtDistance = (positionSummary, distanceText) => {
    if (!Array.isArray(positionSummary)) return '';
    const entry = positionSummary.find(p => p && p.distanceText === distanceText);
    return entry && entry.position ? `${entry.position}@${distanceText.replace('m', '')}` : '';
  };

   // Helper function to format 600m time
   const format600mTime = (positionSummary) => {
    if (!Array.isArray(positionSummary)) return '';
    const entry = positionSummary.find(p => p && p.distanceText === '600m');
    // Check if time exists and is a string like '00:35.150'
    if (entry && entry.time && typeof entry.time === 'string') {
        // Remove leading '00:' and trailing '0' if present
        let formattedTime = entry.time.startsWith('00:') ? entry.time.substring(3) : entry.time;
        formattedTime = formattedTime.endsWith('0') ? formattedTime.slice(0, -1) : formattedTime;
        return formattedTime;
    }
    return '';
  };

  // Helper function to format weight
  const formatWeight = (value, unit) => {
    if (value === null || value === undefined) return '';
    // Assuming unit is typically 'kilogram' and we want 'kg'
    const unitSuffix = unit && unit.toLowerCase() === 'kilogram' ? 'kg' : (unit || '');
    return `${value}${unitSuffix}`;
  };

  // Helper function to format margin
  const formatMargin = (value) => {
    if (value === null || value === undefined) return '';
    return `${value}L`;
  };

  // Helper function to format odds fluctuations
  const formatOddsFlucs = (open, fluc1, sp) => {
    if (open === null && fluc1 === null && sp === null) return '';
    let flucs = [];
    if (open !== null) flucs.push(`$${open}`);
    if (fluc1 !== null) flucs.push(`$${fluc1}`);
    if (sp !== null) flucs.push(`$${sp}`);
    return flucs.join(' ');
  };

  // First, build a map of competitorIds to horse names from all result data
  const competitorNameMap = {};
  
  jsonData.data.competitorForms.forEach(competitorForm => {
    if (!competitorForm || !Array.isArray(competitorForm.forms)) return;

    // For each competitor form, we need to identify the horse name
    const selectionId = competitorForm.selectionId;
    let competitorId = null;
    let horseName = null;
    
    // Find the competitor ID and try to determine the horse name
    competitorForm.forms.forEach(form => {
      if (!form) return;
      
      // Store the competitorId for this selection
      if (!competitorId && form.competitorId) {
        competitorId = form.competitorId;
      }
      
      // Try to find the horse name from the form data
      if (form.finishPosition === 1 && form.winnerName) {
        horseName = form.winnerName;
      } else if (form.finishPosition === 2 && form.secondName) {
        horseName = form.secondName;
      } else if (form.finishPosition === 3 && form.thirdName) {
        horseName = form.thirdName;
      }
    });
    
    // If we found a name, store it in our map
    if (competitorId && horseName) {
      competitorNameMap[competitorId] = horseName;
    }
  });

  // Now process the actual form data with the horse names we found
  jsonData.data.competitorForms.forEach(competitorForm => {
    if (!competitorForm || !Array.isArray(competitorForm.forms)) {
      return;
    }

    // Track the current competitorId for this selection
    let currentCompetitorId = null;

    competitorForm.forms.forEach(form => {
      if (!form || form.isTrial) { // Skip if form is null/undefined or is a trial
        return;
      }

      // Store the competitorId for this selection for later use
      if (!currentCompetitorId && form.competitorId) {
        currentCompetitorId = form.competitorId;
      }

      // Determine Horse Name - using our map or by position
      let horseName = "Unknown";
      
      // First check if the selection has competitor.name available
      if (form.selection?.competitor?.name) {
        horseName = form.selection.competitor.name;
      } 
      // If not available, check if we have the name in our map
      else if (currentCompetitorId && competitorNameMap[currentCompetitorId]) {
        horseName = competitorNameMap[currentCompetitorId];
      } 
      // If still not available, try to determine from position
      else if (form.finishPosition === 1 && form.winnerName) {
        horseName = form.winnerName;
      } else if (form.finishPosition === 2 && form.secondName) {
        horseName = form.secondName;
      } else if (form.finishPosition === 3 && form.thirdName) {
        horseName = form.thirdName;
      } else {
        // If we can't determine the name, use the ID as a fallback
        horseName = `Unknown (ID: ${form.competitorId})`;
      }

      // Extract race name from event, removing prefix if necessary
      let raceName = form.selection?.event?.nameNews || form.selection?.event?.name || '';
      // Many race names include prefixes like "Bet365 Never Ordinary Mdn Plate" - extract the main part
      if (raceName.includes(' Mdn Plate')) {
        const parts = raceName.split(' Mdn Plate');
        // Extract the last part of the sponsor name before "Mdn Plate"
        const nameParts = parts[0].split(' ');
        if (nameParts.length > 1) {
          const lastPart = nameParts[nameParts.length - 1];
          raceName = lastPart + ' Never Ordinary';
        }
      }

      // Extract rail position, removing "Entire Circuit" if present
      let railPosition = form.selection?.event?.meeting?.railPosition || '';
      if (railPosition.includes('Entire Circuit')) {
        railPosition = railPosition.replace(' Entire Circuit', '');
      }

      const output = {
        "Horse Name": horseName,
        "Selection ID": competitorForm.selectionId || form.selection?.id || '',
        "Result": `${form.finishPosition ?? '?'} of ${form.eventStarters ?? '?'}`,
        "Margin": formatMargin(form.margin),
        "Date of race": formatDate(form.meetingDate),
        "Track of race": form.meetingName ?? '',
        "Race Number": form.eventNumber ?? null,
        "Distance": formatWeight(form.eventDistance, 'm'),
        "Track Condition": `${form.trackCondition ?? ''} ${form.trackConditionRating ?? ''}`.trim(),
        "Race name": raceName,
        "Rail Positon": railPosition,
        "Jockey": form.selection?.jockey?.name ?? '',
        "Weight": formatWeight(form.weightCarried, form.weightUnit),
        "Class Weight": form.winnerWeightCarried !== null ? String(form.winnerWeightCarried) : '',
        "Odds Flacs": formatOddsFlucs(form.openPrice, form.fluctuation1, form.startingWinPriceDecimal),
        "Horse Fav": form.isFavourite ? 'FAV' : '',
        "Winner race time": form.winnerTime ?? '',
        "600m time": format600mTime(form.competitorPositionSummary),
        "800m position": getPositionAtDistance(form.competitorPositionSummary, '800m'),
        "400 Position": getPositionAtDistance(form.competitorPositionSummary, '400m'),
        "Winner Name": form.winnerName ?? '',
        "Winner Jockey": form.winnerJockeyName ?? '',
        "Winner Weight": formatWeight(form.winnerWeightCarried, form.winnerWeightCarriedUnit),
        "2nd Place": form.secondName ?? '',
        "2nd Jockey": form.secondJockeyName ?? '',
        "3rd name": form.thirdName ?? '',
        "3rd jockey": form.thirdJockeyName ?? '',
        "3rd weight": formatWeight(form.thirdWeightCarried, form.thirdWeightUnit),
        "3rd Margin": formatMargin(form.thirdMarginDecimal),
        "Video Comment": form.videoComment ?? '',
        "Winners Since": `${form.selection?.event?.competitorsWonSince ?? 0} horse(s) from this race have won since.`
      };

      results.push(output);
    });
  });

  return results;
};

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
 * Get form data for specific selections
 * @param {Array} selectionIds - Array of selection IDs
 * @param {number} limit - Maximum number of form entries to retrieve (default: 5)
 * @returns {Promise<Object>} Object containing raw response and parsed form data
 */
async function getSelectionsForms(selectionIds, limit = 5) {
  // Define the GraphQL query
  const query = `
  query fullFormsBySelectionIds($selectionIds: [String!]!, $limit: Int) {
    competitorForms(selectionIds: $selectionIds, limit: $limit) {
      count
      selectionId
      forms {
        id
        competitorId
        isTrial
        finishPosition
        eventStarters
        margin
        meetingName
        eventNumber
        meetingDate
        eventDistance
        trackCondition
        trackConditionRating
        racePrizeMoney
        barrier
        weight
        weightUnit
        weightCarried
        startingWinPriceDecimal
        openPrice
        fluctuation1
        winnerTime
        winnerName
        winnerJockeyName
        winnerBarrier
        winnerWeight
        winnerWeightUnit
        winnerWeightCarried
        winnerWeightCarriedUnit
        winnerCountry
        secondName
        secondJockeyName
        secondBarrier
        secondWeight
        secondWeightUnit
        secondWeightCarried
        secondWeightCarriedUnit
        secondMarginDecimal
        secondCountry
        statusAbv
        thirdName
        thirdJockeyName
        thirdBarrier
        thirdWeight
        thirdWeightUnit
        thirdWeightCarried
        thirdWeightCarriedUnit
        thirdMarginDecimal
        thirdCountry
        videoComment
        videoNote
        handicapRating
        daysSinceLastRun
        isJockey
        isTwelveMonth
        isSeason
        isTrack
        isDistance
        isClass
        isClockWise
        isFirstUp
        isSecondUp
        isThirdUp
        groupType
        isFavourite
        stewardsReport
        selection {
          id
          jockeyWeightClaim
          status
          gearChanges
          competitor {
            id
            name
            slug
            smallImageUrl
            isKeep
          }
          event {
            ...eventBaseFragment
            nameForm
            eventClass
            competitorsWonSince
            lowestWeight
            groupType
            benchmarkThreshold
            meeting {
              ...meetingBaseFragment
              venue {
                id
                nameAbbrev
              }
            }
          }
          jockey {
            ...jockeyBaseFragment
          }
          trainer {
            ...trainerBaseFragment
          }
        }
        competitorPositionSummary {
          ...competitorPositionSummaryFragment
        }
        competitorFormBenchmark {
          ...competitorFormBenchmarkFragment
        }
        sectionalTime {
          l800 {
            position
          }
          l600 {
            time
            position
          }
          l400 {
            position
          }
          l200 {
            position
          }
          finish {
            time
          }
        }
      }
    }
  }
  
  fragment eventBaseFragment on Event {
    id
    racenetId
    slug
    name
    nameNews
    eventNumber
    status
    startTime
    endTime
    trackType
  }

  
  fragment meetingBaseFragment on Meeting {
    id
    name
    slug
    railPosition
    timeGroup
    meetingDateUtc
    meetingDateLocal
    regionId
  }

  
  fragment jockeyBaseFragment on Jockey {
    id
    name
    slug
    isKeep
    apprentice
  }

  
  fragment trainerBaseFragment on Trainer {
    id
    name
    slug
    isKeep
  }

  
  fragment competitorPositionSummaryFragment on CompetitorPositionSummary {
    id
    distance
    distanceText
    position
    positionText
    time
  }

  
  fragment competitorFormBenchmarkFragment on CompetitorFormBenchmark {
    id
    competitorFormSummaryId
    runnerTempoQuantileRank
    runnerTempoLabel
    runnerTempoDifference
    leaderTempoLabel
    leaderTempoDifference
    runnerTimeDifference
    winnerTimeLabel
    winnerTimeDifference
    runnerTimeDifferenceL800
    runnerTimeDifferenceL600
    runnerTimeDifferenceL400
    runnerTimeDifferenceL200
    runnerRacePositionL800
    runnerRacePositionL600
    runnerRacePositionL400
    runnerRacePositionL200
    runnerMeetingPositionL800
    runnerMeetingPositionL600
    runnerMeetingPositionL400
    runnerMeetingPositionL200
  }`;

  // Define variables for the query
  const variables = {
    selectionIds: selectionIds,
    limit: limit
  };

  // URL encode the variables and query
  const encodedVariables = encodeURIComponent(JSON.stringify(variables));
  const encodedQuery = encodeURIComponent(query);

  // Configure the request
  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `https://puntapi.com/graphql-horse-racing?operationName=fullFormsBySelectionIds&variables=${encodedVariables}&query=${encodedQuery}`,
    headers: { 
      'sec-ch-ua-platform': '"Windows"', 
      'authorization': 'Bearer none', 
      'Referer': 'https://www.racenet.com.au/', 
      'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"', 
      'sec-ch-ua-mobile': '?0', 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36', 
      'accept': '*/*', 
      'DNT': '1', 
      'content-type': 'application/json'
    }
  };

  try {
    logger.info(`Fetching forms for ${selectionIds.length} selections with limit ${limit}`);
    const response = await axios.request(config);
    const rawResponse = response.data;

    // Parse the forms data
    const parsedData = parseFormsData(rawResponse, selectionIds);

    // Save debug files if enabled
    if (getConfig('SAVE_DEBUG_OUTPUT')) {
      const filename = `selections_forms_${selectionIds.length}_items_${new Date().toISOString().replace(/[:.]/g, '-')}`;
      // Save both raw and parsed data to files
      saveDebugFile(rawResponse, `${filename}_raw.json`);
      saveDebugFile(parsedData, `${filename}_parsed.json`);
    }

    // Return both raw response and parsed data
    return {
      rawResponse,
      parsedData
    };

  } catch (error) {
    logger.error('Error fetching or parsing forms data:', error);
    throw error;
  }
}

// Export both functions
module.exports = {
  getSelectionsForms,
  parseFormsData
};

// Test function
const test = async () => {
  try {
    // Example selection IDs from the user's query
    const sampleSelectionIds = ["19300785","19300858","19300865","19300866","19300868","19300850","19300840","19300816","19300852","19300806","19300876","19300804","19300822","19300812","19300872"];
    const { parsedData } = await getSelectionsForms(sampleSelectionIds);
    logger.info('Parsed Data:');
    logger.info(JSON.stringify(parsedData, null, 2));
    console.log(parsedData)
  } catch (error) {
    logger.error('Test function failed:', error);
  }
}

// Only run the test function if this file is being run directly, not when imported
if (require.main === module) {
  test();
} 