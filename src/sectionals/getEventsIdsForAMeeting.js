const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createLogger, getConfig } = require('../utils');

// Create a module-specific logger
const logger = createLogger({ timestamps: true, debug: false });

/**
 * Sends a preflight OPTIONS request to mimic browser CORS behavior
 * @param {string} url - The URL to send the preflight request to
 * @returns {Promise<void>}
 */
async function sendPreflightRequest(url) {
  try {
    await axios({
      method: 'options',
      url: url,
      headers: {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'access-control-request-headers': 'authorization,content-type',
        'access-control-request-method': 'GET',
        'origin': 'https://www.punters.com.au',
        'referer': 'https://www.punters.com.au/',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
      }
    });
    
    // Small delay to mimic browser behavior
    await new Promise(resolve => setTimeout(resolve, 100));
    logger.debug('Preflight request completed');
  } catch (error) {
    // We can ignore errors from the OPTIONS request
    logger.debug('Preflight request completed (with error)');
  }
}

/**
 * Get events for a specific meeting and save data to files
 * @param {string} slug - Meeting slug (e.g., "rosehill-20250401")
 * @param {string} brand - Brand name (default: "punters")
 * @param {string} sport - Sport type (default: "HorseRacing")
 * @returns {Promise<Object>} Object containing raw response and parsed events array
 */
async function getEventsIdsForAMeeting(slug, brand = "punters", sport = "HorseRacing") {
  // Create variables object that will be encoded
  const variables = {
    brand,
    slug,
    sport
  };

  // Create extensions object that will be encoded
  const extensions = {
    persistedQuery: {
      version: 1,
      sha256Hash: "12e43fb6ee3c88d695e4c5a3994745cba2673db897ea6afd5b855fe0a215c20e"
    }
  };

  // URL encode the JSON objects
  const encodedVariables = encodeURIComponent(JSON.stringify(variables));
  const encodedExtensions = encodeURIComponent(JSON.stringify(extensions));

  // API endpoint URL
  const apiUrl = `https://puntapi.com/racing?operationName=meetingBySlug&variables=${encodedVariables}&extensions=${encodedExtensions}`;
  
  // Send preflight request first
  await sendPreflightRequest(apiUrl);

  // Configure the request
  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: apiUrl,
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
    logger.info(`Fetching meeting data for: ${slug}`);
    const response = await axios.request(config);
    const rawResponse = response.data;
    
    // Parse the response to extract events
    let parsedEvents = [];
    let meetingDetails = {};
    
    if (rawResponse?.data?.meeting) {
      const meeting = rawResponse.data.meeting;
      
      // Extract meeting details
      meetingDetails = {
        id: meeting.id,
        name: meeting.name,
        date: meeting.meetingDateUtc,
        category: meeting.meetingCategory,
        type: meeting.meetingType,
        stage: meeting.meetingStage,
        venue: {
          id: meeting.venue?.id,
          name: meeting.venue?.name,
          slug: meeting.venue?.slug,
          state: meeting.venue?.state,
          country: meeting.venue?.country?.name,
          countryCode: meeting.venue?.country?.iso2,
        }
     
      };
      
      // Map events to more detailed format
      if (meeting.events) {
        parsedEvents = meeting.events.map(event => ({
          id: event.id,
          slug: event.slug,
          startTime: event.startTime,
          eventNumber: event.eventNumber,
          isResulted: event.isResulted,
        }));
      }
    }

    // Create test_output directory in the root if it doesn't exist
    const outputDir = path.join(process.cwd(), 'test_output');
    
    // Only save debug files if SAVE_DEBUG_OUTPUT is true
    if (getConfig('SAVE_DEBUG_OUTPUT')) {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Combine all data into a single structure
      const parsedOutput = {
        meeting: meetingDetails,
        events: parsedEvents
      };
      
      // Save both raw and parsed data to files
      const rawOutputFile = path.join(outputDir, `${slug}_raw.json`);
      const parsedOutputFile = path.join(outputDir, `${slug}_parsed.json`);
      
      fs.writeFileSync(rawOutputFile, JSON.stringify(rawResponse, null, 2));
      fs.writeFileSync(parsedOutputFile, JSON.stringify(parsedOutput, null, 2));
      
      logger.debug(`Raw data saved to ${rawOutputFile}`);
      logger.debug(`Parsed data saved to ${parsedOutputFile}`);
    } else {
      logger.debug(`Debug file saving is disabled (SAVE_DEBUG_OUTPUT=false)`);
      
      // Still need to create the parsedOutput object even if we don't save it
      const parsedOutput = {
        meeting: meetingDetails,
        events: parsedEvents
      };
    }
    
    logger.success(`Found ${parsedEvents.length} events for meeting: ${meetingDetails.name}`);

    // Return both raw response and parsed data
    return {
      rawResponse,
      parsedOutput: {
        meeting: meetingDetails,
        events: parsedEvents
      }
    };
  } catch (error) {
    logger.error('Error fetching event data:', error);
    throw error;
  }
}

module.exports = getEventsIdsForAMeeting;


const test = async () => {
  try {
    const { rawResponse, parsedOutput } = await getEventsIdsForAMeeting("rosehill-20250401");
    logger.info('Parsed Events:');
    logger.info(JSON.stringify(parsedOutput.events, null, 2));
  } catch (error) {
    logger.error('Test function failed:', error);
  }
}

// Only run the test function if this file is being run directly
if (require.main === module) {
  test();
}

