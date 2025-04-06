const axios = require('axios');
const { createLogger, getConfig } = require('../utils');
const fs = require('fs');
const path = require('path');
const { parseSelectionsData } = require('./getSelectionsForAnEvent');

// Create a module-specific logger
const logger = createLogger({ timestamps: true, debug: false });

/**
 * Gets meeting slugs and event selections for a specified date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} - Object containing meeting slugs and event selections
 */
const getMeetingsOnACertainDate = async (date) => {
  // Use current date if none provided
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  // Define the GraphQL query
  const query = `
  query meetingsIndexByStartEndDate($startDate: String, $endDate: String, $sportIds: [Int!], $limit: Int) {
    meetingsGrouped(startDate: $startDate, endDate: $endDate, sportIds: $sportIds, limit: $limit) {
      group
      meetings {
        ...meetingFragment
        venue {
          ...venueFragment
        }
        events {
          ...eventResultsFragment
          trackCondition {
            ...trackConditionFragment
          }
          selections(topFour: true) {
            ...selectionBaseFragment
            competitor {
              ...competitorBaseFragment
            }
            result {
              finishPosition
            }
            odds {
              ...oddsFragment
            }
          }
        }
      }
    }
  }
  
  fragment meetingFragment on Meeting {
    ...meetingBaseFragment
    sportId
    penetrometer
    trackComments
    tabStatus
    meetingCategory
    meetingStage
    meetingType
    totalPrizeMoney
    state
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
  
  fragment venueFragment on Venue {
    ...venueBaseFragment
    isMetro
    address
    weatherLastUpdated
    country {
      id
      name
      iso2
      iso3
      horseCountry
    }
  }
  
  fragment venueBaseFragment on Venue {
    id
    name
    nameAbbrev
    slug
    state
  }
  
  fragment eventResultsFragment on Event {
    ...eventBaseFragment
    startTime
    isResulted
    resultState
    isAbandoned
    placeWinners
    distance
    eventClass
    groupType
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
  
  fragment trackConditionFragment on TrackCondition {
    eventId
    overall
    rating
    surface
  }
  
  fragment selectionBaseFragment on Selection {
    id
    racenetId
    competitorNumber
    barrierNumber
    isEmergency
    status
    silkImageUrl
    __typename
  }
  
  fragment competitorBaseFragment on Competitor {
    id
    name
    slug
    smallImageUrl
    isKeep
  }
  
  fragment oddsFragment on Odd {
    type
    betType
    bookmakerId
    price {
      value
    }
  }`;

  // Define variables for the query
  const variables = {
    startDate: targetDate,
    endDate: targetDate,
    limit: 100
  };

  // URL encode the variables and query
  const encodedVariables = encodeURIComponent(JSON.stringify(variables));
  const encodedQuery = encodeURIComponent(query);

  // The API endpoint URL with direct query
  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `https://puntapi.com/graphql-horse-racing?operationName=meetingsIndexByStartEndDate&variables=${encodedVariables}&query=${encodedQuery}`,
    headers: { 
      'accept': '*/*', 
      'accept-language': 'en-US,en;q=0.9,be;q=0.8,ar;q=0.7', 
      'authorization': 'Bearer none', 
      'content-type': 'application/json', 
      'dnt': '1', 
      'origin': 'https://www.racenet.com.au', 
      'priority': 'u=1, i', 
      'referer': 'https://www.racenet.com.au/', 
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
    logger.info(`Fetching race meetings for date: ${targetDate}`);
    const response = await axios.request(config);
    
    // Log response status
    logger.info(`Response status: ${response.status} ${response.statusText}`);
    
    // Save the raw JSON for debugging
    const outputDir = path.join(process.cwd(), 'test_output');
    
    // Only save debug files if SAVE_DEBUG_OUTPUT is true
    if (getConfig('SAVE_DEBUG_OUTPUT')) {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const debugFile = path.join(outputDir, `racing_results_${targetDate}.json`);
      fs.writeFileSync(debugFile, JSON.stringify(response.data, null, 2));
      logger.debug(`Saved raw JSON response to ${debugFile}`);
    } else {
      logger.debug(`Debug file saving is disabled (SAVE_DEBUG_OUTPUT=false)`);
    }
    
    // Initialize result structure
    const result = {
      meetingSlugs: [],
      eventSelections: []
    };
    
    // Check if the response has the expected structure
    if (response.data && 
        response.data.data && 
        response.data.data.meetingsGrouped) {
      
      // Find the Australia group
      const australiaGroup = response.data.data.meetingsGrouped.find(
        group => group.group === 'Australia'
      );
      
      if (australiaGroup && australiaGroup.meetings) {
        // Extract slugs from Australian meetings and process events
        australiaGroup.meetings.forEach(meeting => {
          if (meeting.slug) {
            result.meetingSlugs.push(meeting.slug);
          }
          
          // Process events and selections if available
          if (meeting.events && Array.isArray(meeting.events)) {
            meeting.events.forEach(event => {
              if (event && event.id) {
                // Add __typename to selections if missing
                if (event.selections && Array.isArray(event.selections)) {
                  event.selections.forEach(selection => {
                    if (!selection.__typename) {
                      selection.__typename = "Selection";
                    }
                  });
                }
                
                // Parse the selections data for this event
                const parsedEvent = parseSelectionsData(event, event.id);
                if (parsedEvent.selections.length > 0) {
                  // Add meeting information to the event data
                  result.eventSelections.push({
                    meetingId: meeting.id,
                    meetingName: meeting.name,
                    meetingSlug: meeting.slug,
                    meetingState: meeting.state,
                    ...parsedEvent
                  });
                }
              }
            });
          }
        });
      }
    }
    
    if (result.meetingSlugs.length === 0) {
      logger.warn(`NO AUSTRALIAN MEETINGS FOUND for date: ${targetDate}`);
    } else {
      logger.success(`Found ${result.meetingSlugs.length} Australian meetings with ${result.eventSelections.length} events for date: ${targetDate}`);
    }
    
    return result;
  } catch (error) {
    logger.error(`Error fetching race meetings for date: ${targetDate}`, error);
    throw error;
  }
};

module.exports = getMeetingsOnACertainDate;

// Example usage
async function example() {
  const date = '2025-03-20';
  try {
    logger.info(`Running example with date: ${date}`);
    const result = await getMeetingsOnACertainDate(date);
    logger.info('Meeting slugs:');
    logger.info(JSON.stringify(result.meetingSlugs, null, 2));
    logger.info(`Total events with selections: ${result.eventSelections.length}`);
    if (result.eventSelections.length > 0) {
      logger.info('First event selection data:');
      logger.info(JSON.stringify(result.eventSelections[0], null, 2));
    }
  } catch (error) {
    logger.error('Example failed:', error);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  example();
}
