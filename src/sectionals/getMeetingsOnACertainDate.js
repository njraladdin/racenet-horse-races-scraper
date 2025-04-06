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
  
  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `https://puntapi.com/graphql-horse-racing?operationName=meetingsIndexByStartEndDate&variables=%7B%22startDate%22%3A%22${targetDate}%22%2C%22endDate%22%3A%22${targetDate}%22%2C%22limit%22%3A100%7D&extensions=%7B%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%220c0f74621a771c40cfff90635d94fef66c8ac7284bdaf10467fcd002c74f68cd%22%7D%7D`,
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
