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
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Cookie': 'n_regis=123456789; nk=efd619674eb1cfe7d38fba971bb1efa4-1743650514'

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
 * Get sectional results for a list of selection IDs
 * @param {Array<string>} selectionIds - Array of selection IDs
 * @returns {Promise<Object<string, Array<{raceId: string, meetingDate: string, eventNameForm: string, venueName: string, sectionalTime: Object}>>>} Parsed sectional times and race info grouped by selection ID
 */
async function getSelectionsResults(selectionIds) {
  logger.info(`Processing ${selectionIds.length} selections in a single batch`);
  return processBatch(selectionIds);
}

/**
 * Process a batch of selection IDs
 * @param {Array<string>} batchSelectionIds - Array of selection IDs
 * @returns {Promise<Object>} Parsed results
 */
async function processBatch(batchSelectionIds) {
  // Create variables object that will be encoded
  const variables = {
    selectionIds: batchSelectionIds
  };

  // Define the GraphQL query
  const query = `
fragment SectionalTimeFragment on SectionalTime {
  split
  speed
}

fragment SectionalTimeSummaryFragment on SectionalTimeSummary {
  earlySpeed
  midSpeed
  lateSpeed
  averageSpeed
  averageTime
}

fragment VenueBaseFragment on Venue {
  id
  name
  sportId
}

fragment SectionalSelectionResultFragment on SelectionResult {
  id
  finishPosition
  eventStarters
  meetingDate
  eventDistance
  eventDistanceUnit
  trackType
  trackCondition
  trackConditionRating
  eventNumber
  eventNameForm
  finishTime
  venue {
    ...VenueBaseFragment
  }
  sectionalTimeSummary {
    ...SectionalTimeSummaryFragment
  }
  sectionalTime {
    l800 {
      ...SectionalTimeFragment
    }
    l600 {
      ...SectionalTimeFragment
    }
    l400 {
      ...SectionalTimeFragment
    }
    l200 {
      ...SectionalTimeFragment
    }
    finish {
      ...SectionalTimeFragment
    }
  }
}

query getSectionalsBySelectionIds($selectionIds: [String!]!, $limit: Int) {
  competitorForms(selectionIds: $selectionIds, limit: $limit, isTrial: false) {
    count
    selectionId
    forms {
      ...SectionalSelectionResultFragment
    }
  }
}`;

  // URL encode the variables and query
  const encodedVariables = encodeURIComponent(JSON.stringify(variables));
  const encodedQuery = encodeURIComponent(query);

  // The API endpoint URL with direct query
  const apiUrl = `https://puntapi.com/racing?operationName=getSectionalsBySelectionIds&variables=${encodedVariables}&query=${encodedQuery}`;
  
  // Send preflight request first
  await sendPreflightRequest(apiUrl);

  // Configure the actual data request
  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: apiUrl,
    headers: { 
      'accept': '*/*', 
      'accept-language': 'en-US,en;q=0.9', 
      'authorization': 'Bearer none', 
      'content-type': 'application/json', 
      'dnt': '1', 
      'origin': 'https://www.punters.com.au', 
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
    logger.debug(`Fetching sectionals for ${batchSelectionIds.length} selections`);
    const response = await axios.request(config);
    const rawResponse = response.data;
    
    // Better debug logging of the raw response structure
   // logger.debug('Raw competitorForms structure:');
   // console.log(JSON.stringify(rawResponse.data.competitorForms, null, 2));
    
    // Parse the response to extract sectional times
    const competitorForms = rawResponse?.data?.competitorForms;
    
    // // Log each competitor form with more details including __typename
    // competitorForms.forEach(competitorForm => {
    //   console.log(`Selection ID: ${competitorForm.selectionId}, Forms count: ${competitorForm.forms?.length || 0}`);
    //   if (competitorForm.forms && competitorForm.forms.length > 0) {
    //     console.log('First form __typename:', competitorForm.forms[0].__typename);
    //     console.log('First form has sectionalTime?', !!competitorForm.forms[0].sectionalTime);
    //   }
    // });

    if (!Array.isArray(competitorForms)) {
      logger.warn(`No competitor forms found for selectionIds`);
      logger.debug('First 5 selection IDs: ' + batchSelectionIds.slice(0, 5).join(', '));
      
      // Check if there's an error message in the response
      if (rawResponse?.errors) {
        // Convert the API errors to a readable string format
        const errorDetails = JSON.stringify(rawResponse.errors, null, 2);
        logger.error(`API returned errors: ${errorDetails}`);
      }
      
      return {};
    }

    const parsedResults = {};

    competitorForms.forEach(competitorForm => {
      const selectionId = competitorForm.selectionId;
      const forms = competitorForm.forms;

      if (selectionId && Array.isArray(forms)) {
        // Log before filtering to see what we're working with
       // console.log(`Selection ${selectionId}: ${forms.length} forms before filtering`);
        
        const filteredForms = forms.filter(form => {
          // Remove the __typename check since it's always undefined
          const hasSectionalTime = !!form.sectionalTime;
          
          if (!hasSectionalTime) {
            console.log(`Filtering out form without sectionalTime`);
          }
          
          return hasSectionalTime;
        });
        
       // console.log(`Selection ${selectionId}: ${filteredForms.length} forms after filtering`);
        
        parsedResults[selectionId] = filteredForms
          .map(form => {
            // Remove __typename from sectionalTime sub-objects
            const cleanedSectionalTime = {};
            if (form.sectionalTime) {
              for (const key in form.sectionalTime) {
                if (key !== '__typename') {
                  const section = form.sectionalTime[key];
                  if (section) {
                    // Convert key from 'l800' to 'last800' for clarity
                    const renamedKey = key.startsWith('l') && !isNaN(key.substring(1)) 
                      ? 'last' + key.substring(1) 
                      : key;
                    
                    cleanedSectionalTime[renamedKey] = {
                      split: section.split,
                      speed: section.speed
                    };
                  } else {
                    // Convert key from 'l800' to 'last800' for clarity
                    const renamedKey = key.startsWith('l') && !isNaN(key.substring(1)) 
                      ? 'last' + key.substring(1) 
                      : key;
                    
                    cleanedSectionalTime[renamedKey] = null;
                  }
                }
              }
            }

            return {
              raceId: form.id,
              meetingDate: form.meetingDate,
              eventNameForm: form.eventNameForm,
              venueName: form.venue?.name, // Safely access venue name
              finishTime: form.finishTime, // Race time
              sectionalTimeSummary: form.sectionalTimeSummary ? {
                earlySpeed: form.sectionalTimeSummary.earlySpeed,
                midSpeed: form.sectionalTimeSummary.midSpeed,
                lateSpeed: form.sectionalTimeSummary.lateSpeed,
                averageSpeed: form.sectionalTimeSummary.averageSpeed,
                averageTime: form.sectionalTimeSummary.averageTime
              } : null,
              sectionalTime: cleanedSectionalTime
            };
          });
      }
    });

    // Create test_output directory in the root if it doesn't exist
    const outputDir = path.join(process.cwd(), 'test_output');
    
    // Only save debug files if SAVE_DEBUG_OUTPUT is true
    if (getConfig('SAVE_DEBUG_OUTPUT')) {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Create filenames with selection IDs
      const selectionIdString = batchSelectionIds.join('_').slice(0, 50); // Limit filename length
      const rawOutputFile = path.join(outputDir, `selection_results_${selectionIdString}_raw.json`);
      const parsedOutputFile = path.join(outputDir, `selection_results_${selectionIdString}_parsed.json`);
      
      fs.writeFileSync(rawOutputFile, JSON.stringify(rawResponse, null, 2));
      fs.writeFileSync(parsedOutputFile, JSON.stringify(parsedResults, null, 2));
      
      logger.debug(`Raw data saved to ${rawOutputFile}`);
      logger.debug(`Parsed data saved to ${parsedOutputFile}`);
    } else {
      logger.debug(`Debug file saving is disabled (SAVE_DEBUG_OUTPUT=false)`);
    }
    
    // Log success summary
    const processedCount = Object.keys(parsedResults).length;
    const uniqueSelectionCount = new Set(batchSelectionIds).size;
    logger.debug(`Retrieved sectional data for ${processedCount} of ${uniqueSelectionCount} unique selections`);

    return parsedResults;

  } catch (error) {
    logger.error('Error fetching selection results:', error);
    throw error;
  }
}

module.exports = getSelectionsResults;

// Test function
const test = async () => {
  try {
   // const testSelectionIds = ["19273322", "19273321", "19273329", "19273319", "19273316", "19273324", "19273323", "19273331", "19273330", "19273313"];
    const testSelectionIds = ["14091024","14091021","14091025","14091015","14091026","14091022","14091019","14091027"];
    const results = await getSelectionsResults(testSelectionIds);
  //  console.log(JSON.stringify(results, null, 2));
    logger.success(`Retrieved sectional results for ${Object.keys(results).length} selections`);
  } catch (error) {
    logger.error('Test function failed:', error);
  }
}

// Run the test function if this file is being run directly
if (require.main === module) {
  test();
} 