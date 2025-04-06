const fs = require('fs');
const path = require('path');
const { getSectionals, getMeetingsOnACertainDate, exportSectionalData } = require('./sectionals');
const { createLogger, setConfig, getConfig } = require('./utils');

// Create logger
const logger = createLogger({ timestamps: true, debug: true });

// Set all configuration values explicitly for historical data
setConfig('SAVE_DEBUG_OUTPUT', false);  // Debug output files are disabled by default
setConfig('SAVE_JSON', false);          // JSON output files are disabled by default for historical data
setConfig('SAVE_CSV', true);            // CSV output files are enabled by default for historical data
setConfig('SAVE_RAW_DATA', false);      // Raw data output files are disabled by default

// Base data directory
const DATA_DIR = 'data';

// Base output directories - only two folders
const BASE_JSON_OUTPUT_DIR = path.join(DATA_DIR, 'output_json_historical');
const BASE_CSV_OUTPUT_DIR = path.join(DATA_DIR, 'output_csv_historical');

// Function to get date string in YYYY-MM-DD format
function getDateString(date) {
  return date.toISOString().split('T')[0];
}

// Default start date (January 1, 2023)
const DEFAULT_START_DATE = "2023-01-01";

// Progress update interval (ms)
const PROGRESS_UPDATE_INTERVAL = 10000; // 10 seconds

// Function to get dates between two dates
function getDatesBetween(startDate, endDate) {
  const dates = [];
  let currentDate = new Date(startDate);
  const endDateTime = new Date(endDate);
  
  while (currentDate <= endDateTime) {
    dates.push(getDateString(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dates;
}

async function extractSectionalDataForDateRange() {
  try {
    const startDate = DEFAULT_START_DATE;
    
    // Calculate date range
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const endDate = getDateString(yesterday);
    
    logger.info(`Start date: ${startDate}, End date: ${endDate}`);
    
    const dates = getDatesBetween(startDate, endDate);
    
    if (dates.length === 0) {
      logger.error(`No valid dates found between ${startDate} and ${endDate}`);
      return;
    }
    
    logger.info(`Extracting historical sectional data for ${dates.length} days from ${dates[0]} to ${dates[dates.length - 1]}`);
    
    const startDateTime = new Date(startDate);
    const daysDifference = Math.round((yesterday - startDateTime) / (1000 * 60 * 60 * 24));
    logger.info(`Covering approximately ${(daysDifference/365).toFixed(1)} years (${daysDifference} days)`);
    
    // Start timing for overall process
    const processStartTime = Date.now();
    let completedDates = 0;
    let currentDateIndex = 0;
    let lastProgressUpdate = 0;
    
    // Setup interval for progress updates
    const progressInterval = setInterval(() => {
      if (completedDates >= dates.length) {
        clearInterval(progressInterval);
        return;
      }
      
      const elapsedTimeMs = Date.now() - processStartTime;
      const elapsedTimeSec = elapsedTimeMs / 1000;
      const elapsedTimeMin = elapsedTimeSec / 60;
      
      // Only calculate average if we've completed at least one date
      if (completedDates > 0) {
        const avgTimePerDateMin = elapsedTimeMin / completedDates;
        const remainingDates = dates.length - completedDates;
        const estTimeRemainingMin = avgTimePerDateMin * remainingDates;
        
        // Draw a fancy progress bar
        const percent = Math.round((completedDates / dates.length) * 100);
        
        logger.info(`Progress: ${completedDates}/${dates.length} dates processed (${percent}%)`);
        logger.progress('Overall progress', completedDates, dates.length);
        logger.info(`Time: ${elapsedTimeMin.toFixed(2)} min elapsed, ~${estTimeRemainingMin.toFixed(2)} min remaining`);
      } else {
        logger.info(`Time elapsed: ${elapsedTimeMin.toFixed(2)} minutes`);
      }
    }, PROGRESS_UPDATE_INTERVAL);
    
    // Process each date
    for (let i = 0; i < dates.length; i++) {
      currentDateIndex = i;
      const date = dates[i];
      const dateStartTime = Date.now();
      
      logger.info(`Processing date ${i+1}/${dates.length}: ${date}`);
      
      try {
        // Get all meetings and event selections for the date
        logger.info(`Fetching meetings and event selections for date: ${date}`);
        const meetingsData = await getMeetingsOnACertainDate(date);
        
        if (!meetingsData || !meetingsData.meetingSlugs || meetingsData.meetingSlugs.length === 0) {
          logger.warn(`No meetings found for date: ${date}`);
          continue;
        }
        
        const meetingSlugs = meetingsData.meetingSlugs;
        const eventSelections = meetingsData.eventSelections || [];
        
        logger.success(`Found ${meetingSlugs.length} meetings with ${eventSelections.length} events for date: ${date}`);
        
        if (eventSelections.length > 0) {
          logger.info(`OPTIMIZATION: Using preloaded event data from initial API call to reduce network requests`);
        }
        
        // Process each meeting for this date
        for (let j = 0; j < meetingSlugs.length; j++) {
          const slug = meetingSlugs[j];
          logger.meeting(`Processing meeting ${j+1}/${meetingSlugs.length}: ${slug}`);
          logger.progress('Meeting processing', j+1, meetingSlugs.length);
          
          try {
            // Create output directories for this date
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
              slug, 
              "punters", 
              "HorseRacing", 
              null,
              5, // Default concurrency
              eventSelections
            );
            
            // Export both raw and formatted data if available
            if (results) {
              // Need to provide outputFile to derive the base filename (slug)
              const baseFilePath = path.join(jsonOutputFolder, slug);
              
              // Export data to JSON and CSV formats with raw data
              const { jsonPath, csvPath, rawJsonPath } = exportSectionalData(
                { 
                  formattedData: results.formattedData,
                  rawResults: results
                }, 
                { 
                  outputFile: baseFilePath,  // Provides the meeting slug as filename
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
            
            logger.success(`Completed processing meeting: ${slug}`);
          } catch (error) {
            logger.error(`Failed to process meeting ${slug}:`, error);
          }
          
          // Small delay between meetings to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Calculate time statistics after each date is processed
        completedDates++;
        const dateTimeMin = (Date.now() - dateStartTime) / 1000 / 60;
        logger.success(`Date ${date} completed in ${dateTimeMin.toFixed(2)} minutes`);
        
        // Only show detailed progress when not using the interval
        if (Date.now() - lastProgressUpdate > PROGRESS_UPDATE_INTERVAL) {
          const elapsedTimeMs = Date.now() - processStartTime;
          const elapsedTimeMin = elapsedTimeMs / 1000 / 60;
          const avgTimePerDateMin = elapsedTimeMin / completedDates;
          const remainingDates = dates.length - completedDates;
          const estTimeRemainingMin = avgTimePerDateMin * remainingDates;
          
          logger.progress('Overall progress', completedDates, dates.length);
          logger.info(`Time: ${elapsedTimeMin.toFixed(2)} min elapsed, ~${estTimeRemainingMin.toFixed(2)} min remaining`);
          lastProgressUpdate = Date.now();
        }
      } catch (error) {
        logger.error(`Failed to process date ${date}:`, error);
      }
      
      // Small delay between dates
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Clear the progress interval if it's still running
    clearInterval(progressInterval);
    
    // Log total execution time
    const totalTimeMin = (Date.now() - processStartTime) / 1000 / 60;
    logger.success(`Completed extracting historical sectional data for all dates in ${totalTimeMin.toFixed(2)} minutes`);
  } catch (error) {
    logger.error("Critical error in extraction process:", error);
  }
}

// Run the extraction if this file is executed directly
if (require.main === module) {
  // Check for command line flags
  const args = process.argv.slice(2);
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
  
  extractSectionalDataForDateRange().catch(error => {
    console.error('Failed to extract historical data:', error);
    process.exit(1);
  });
}

module.exports = { extractSectionalDataForDateRange }; 