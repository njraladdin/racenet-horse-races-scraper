const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { getSectionals, getMeetingsOnACertainDate, exportSectionalData } = require('./sectionals');
const { createLogger, setConfig, getConfig } = require('./utils');

// Create logger
const logger = createLogger({ timestamps: true, debug: true });

// Set all configuration values explicitly for daily data
setConfig('SAVE_DEBUG_OUTPUT', false);  // Debug output files are disabled by default
setConfig('SAVE_JSON', false);           // JSON output files are enabled by default for daily data
setConfig('SAVE_CSV', true);            // CSV output files are enabled by default for daily data
setConfig('SAVE_RAW_DATA', false);       // Raw data output files are enabled by default for daily data

// Base data directory
const DATA_DIR = 'data';

// Base output directories - only two folders
const BASE_JSON_OUTPUT_DIR = path.join(DATA_DIR, 'output_json_daily');
const BASE_CSV_OUTPUT_DIR = path.join(DATA_DIR, 'output_csv_daily');

// Function to get today's date in YYYY-MM-DD format
function getTodayDateString() {
  return moment().format('YYYY-MM-DD');
}

// Scrape a single meeting
async function scrapeMeeting(date, meetingSlug, preloadedEventSelections = null) {
  logger.info(`Scraping meeting: ${meetingSlug} for date: ${date}`);
  
  try {
    // Output directories for this meeting
    const jsonOutputFolder = path.join(BASE_JSON_OUTPUT_DIR, date);
    const csvOutputFolder = path.join(BASE_CSV_OUTPUT_DIR, date);
    
    // Create output directories if they don't exist
    [jsonOutputFolder, csvOutputFolder].forEach(folder => {
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }
    });
    
    // Process the meeting with preloaded event selections if available
    const results = await getSectionals(
      meetingSlug, 
      "punters", 
      "HorseRacing", 
      null,
      5, // Default concurrency
      preloadedEventSelections
    );
    
    // Export both raw and formatted data
    if (results) {
      // Use the jsonOutputFolder as the base folder for the output file
      const outputFile = path.join(jsonOutputFolder, meetingSlug);
      
      // Export data to JSON and CSV formats with raw data
      const { jsonPath, csvPath, rawJsonPath } = exportSectionalData(
        { 
          formattedData: results.formattedData,
          rawResults: results
        }, 
        { 
          outputFile,
          jsonOutputFolder,
          csvOutputFolder,
          includeJson: getConfig('SAVE_JSON'),
          includeCsv: getConfig('SAVE_CSV'),
          includeRawData: getConfig('SAVE_RAW_DATA')
        }
      );
      
      if (getConfig('SAVE_JSON') && jsonPath) {
        logger.success(`Formatted data exported to JSON: ${jsonPath}`);
      }
      if (getConfig('SAVE_CSV') && csvPath) {
        logger.success(`Formatted data exported to CSV: ${csvPath}`);
      }
      if (getConfig('SAVE_RAW_DATA') && rawJsonPath) {
        logger.success(`Raw data exported to JSON: ${rawJsonPath}`);
      }
    }
    
    logger.success(`Successfully scraped meeting: ${meetingSlug}`);
    return true;
  } catch (error) {
    logger.error(`Failed to scrape meeting ${meetingSlug}:`, error);
    return false;
  }
}

// Main function to scrape today's meetings
async function scrapeAllTodaysMeetings() {
  const date = getTodayDateString(); //"2023-01-09";
  logger.info(`Scraping meetings for today: ${date}`);
  
  try {
    // Get all meetings and event selections for today
    const meetingsData = await getMeetingsOnACertainDate(date);
    
    if (!meetingsData || !meetingsData.meetingSlugs || meetingsData.meetingSlugs.length === 0) {
      logger.info(`No meetings found for today (${date})`);
      return;
    }
    
    const meetingSlugs = meetingsData.meetingSlugs;
    const eventSelections = meetingsData.eventSelections || [];
    
    logger.info(`Found ${meetingSlugs.length} meetings with ${eventSelections.length} events for today (${date})`);
    
    if (eventSelections.length > 0) {
      logger.info(`OPTIMIZATION: Using preloaded event data from initial API call to reduce network requests`);
    }
    
    // Process each meeting
    let successCount = 0;
    for (const meetingSlug of meetingSlugs) {
      const success = await scrapeMeeting(date, meetingSlug, eventSelections);
      if (success) successCount++;
      
      // Add a small delay between meetings to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    logger.success(`Completed scraping ${successCount}/${meetingSlugs.length} meetings for today (${date})`);
  } catch (error) {
    logger.error('Error scraping data:', error);
  }
}

// Start the hourly scraper
function startHourlyScraper() {
  logger.info('Starting hourly meeting scraper');
  
  // Run immediately on startup
  scrapeAllTodaysMeetings()
    .then(() => logger.success('Initial scrape completed'))
    .catch(error => logger.error('Error in initial scrape:', error));
  
  // Then run every hour
  const oneHour = 60 * 60 * 1000;
  setInterval(() => {
    logger.info(`Running hourly scrape at ${new Date().toLocaleTimeString()}`);
    scrapeAllTodaysMeetings()
      .then(() => logger.success('Hourly scrape completed'))
      .catch(error => logger.error('Error in hourly scrape:', error));
  }, oneHour);
}

// Run the script if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const runOnce = args.includes('--once');
  const enableDebugOutput = args.includes('--debug-output');
  const disableJSON = args.includes('--no-json');
  const disableCSV = args.includes('--no-csv');
  const enableRawData = args.includes('--raw-data');
  
  if (enableDebugOutput) {
    setConfig('SAVE_DEBUG_OUTPUT', true);
    logger.info('Debug output saving is ENABLED');
  }
  
  if (disableJSON) {
    setConfig('SAVE_JSON', false);
    logger.info('JSON output is DISABLED');
  }
  
  if (disableCSV) {
    setConfig('SAVE_CSV', false);
    logger.info('CSV output is DISABLED');
  }
  
  if (enableRawData) {
    setConfig('SAVE_RAW_DATA', true);
    logger.info('Raw data saving is ENABLED');
  }
  
  if (runOnce) {
    // Run once mode
    logger.info('Running in one-time mode');
    scrapeAllTodaysMeetings()
      .then(() => {
        logger.info('One-time scrape completed');
      })
      .catch((error) => {
        logger.error('One-time scrape failed:', error);
        process.exit(1);
      });
  } else {
    // Normal hourly mode
    logger.info('Starting hourly scraper service');
    startHourlyScraper();
  }
}

module.exports = { 
  scrapeAllTodaysMeetings,
  startHourlyScraper
};