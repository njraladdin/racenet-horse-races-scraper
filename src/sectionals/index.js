const fs = require('fs');
const path = require('path');
const exportSectionalData = require('./exportSectionalData');

const exportFormsData = require('./exportFormsData');
const getForms = require('./getForms');
const getSectionals = require('./getSectionals');

const getMeetingsOnACertainDate = require('./getMeetingsOnACertainDate');
const { createLogger } = require('../utils');

// Create an enhanced logger
const logger = createLogger({ timestamps: true, debug: true });

/**
 * Get all sectional times for a race meeting by slug
 * @param {string} meetingSlug - Meeting slug (e.g., "rosehill-20250401")
 * @param {string} brand - Brand name (default: "punters")
 * @param {string} sport - Sport type (default: "HorseRacing")
 * @param {number} eventLimit - Optional limit on number of events to process (for testing)
 * @param {number} concurrency - Number of concurrent event processing (default: 5)
 * @param {Array} preloadedEventSelections - Optional preloaded event selections data
 * @returns {Promise<Object>} Object containing sectional times and formatted data for all events in the meeting
 */





const test = async () => {
  try {
    // Test with a specific date
    const date = '2025-03-18';
    logger.info(`Running sectional scraper for date: ${date}`);
    
    if (!date) {
      logger.error('Date parameter must be provided');
      return;
    }
    
    try {
      // Get all meetings and event selections for the specified date
      logger.info(`Fetching meetings and event selections for date: ${date}`);
      const meetingsData = await getMeetingsOnACertainDate(date);
      
      if (!meetingsData || !meetingsData.meetingSlugs || meetingsData.meetingSlugs.length === 0) {
        logger.error(`No meetings found for date: ${date}`);
        return;
      }
      
      const meetingSlugs = meetingsData.meetingSlugs;
      const eventSelections = meetingsData.eventSelections || [];
      
      logger.success(`Found ${meetingSlugs.length} meetings with ${eventSelections.length} events for date: ${date}`);
      
      // Process each meeting one by one
      const processingResults = [];
      const overallSummary = {
        date,
        totalMeetings: meetingSlugs.length,
        successfulMeetings: 0,
        failedMeetings: 0,
        totalEvents: 0,
        totalSelections: 0,
        totalSelectionsWithSectionals: 0,
        totalErrors: 0,
        startTime: new Date(),
        endTime: null,
        duration: null,
        meetingDetails: [] // Array to store per-meeting details
      };
      
      for (let i = 0; i < meetingSlugs.length; i++) {
        const slug = meetingSlugs[i];
        logger.meeting(`Processing meeting: ${slug}`, i + 1, meetingSlugs.length);
        
        try {
          // Use default values for testing
          const eventLimit = null;
          const outputFolder = path.join('output', date);
          const jsonOutputFolder = path.join('output_json', date);
          const csvOutputFolder = path.join('output_csv', date);
          const concurrency = 3;  // Set concurrent event processing to 3
          
          // Create output directory if it doesn't exist
          if (!fs.existsSync(outputFolder)) {
            fs.mkdirSync(outputFolder, { recursive: true });
          }
          
          // Process the meeting, passing the preloaded event selections
          const results = await getSectionals(
            slug, 
            "punters", 
            "HorseRacing", 
            eventLimit,
            concurrency,
            eventSelections
          );
          
          // Export the formatted data separately
          if (results.formattedData && results.formattedData.length > 0) {
            // Create export directories if they don't exist
            [jsonOutputFolder, csvOutputFolder].forEach(folder => {
              if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
              }
            });
            
            const formattedOutputFile = path.join(outputFolder, `${slug}_formatted`);
            const { jsonPath, csvPath } = exportSectionalData(results.formattedData, { 
              outputFile: formattedOutputFile,
              jsonOutputFolder,
              csvOutputFolder
            });
            
            logger.success(`Formatted data exported to JSON: ${jsonPath}`);
            logger.success(`Formatted data exported to CSV: ${csvPath}`);
          }
          
          // Add meeting results to overall summary
          if (results.summary) {
            overallSummary.totalEvents += results.summary.totalEvents;
            overallSummary.totalSelections += results.summary.totalSelections;
            overallSummary.totalSelectionsWithSectionals += results.summary.selectionsWithSectionals;
            overallSummary.totalErrors += results.summary.errorCount;
            
            // Add meeting to meeting details
            overallSummary.meetingDetails.push({
              meetingSlug: slug,
              totalEvents: results.summary.totalEvents,
              processedEvents: results.summary.processedEvents,
              totalSelections: results.summary.totalSelections,
              selectionsWithSectionals: results.summary.selectionsWithSectionals,
              eventDetails: results.summary.eventDetails
            });
          }
          
          processingResults.push({
            meetingSlug: slug,
            success: true,
            summary: results.summary
          });
          
          overallSummary.successfulMeetings++;
          
          logger.success(`Completed processing meeting ${i + 1}/${meetingSlugs.length}: ${slug}`);
        } catch (error) {
          logger.error(`Failed to process meeting ${slug}:`, error);
          processingResults.push({
            meetingSlug: slug,
            success: false,
            error: error.message
          });
          
          overallSummary.failedMeetings++;
          overallSummary.totalErrors++;
        }
      }
      
      // Complete overall summary
      overallSummary.endTime = new Date();
      overallSummary.duration = (overallSummary.endTime - overallSummary.startTime) / 1000;
      
      // Log overall summary
      logger.success(`------- OVERALL SUMMARY -------`);
      logger.success(`Date: ${overallSummary.date}`);
      logger.success(`Duration: ${overallSummary.duration.toFixed(2)} seconds`);
      logger.success(`Meetings: ${overallSummary.successfulMeetings}/${overallSummary.totalMeetings} successful`);
      logger.success(`Events: ${overallSummary.totalEvents} total, processed ${overallSummary.meetingDetails.reduce((sum, m) => sum + m.processedEvents, 0)}`);
      logger.success(`Selections: ${overallSummary.totalSelections} total, ${overallSummary.totalSelectionsWithSectionals} with sectionals`);
      logger.success(`Errors: ${overallSummary.totalErrors}`);
      
      // Log meetings with problems
      const problemMeetings = overallSummary.meetingDetails.filter(m => 
        m.processedEvents < m.totalEvents || m.selectionsWithSectionals < m.totalSelections
      );
      
      if (problemMeetings.length > 0) {
        logger.success('Meetings with Issues:');
        problemMeetings.forEach(meeting => {
          logger.success(`  ${meeting.meetingSlug}: ${meeting.processedEvents}/${meeting.totalEvents} events, ${meeting.selectionsWithSectionals}/${meeting.totalSelections} selections with data`);
          
          // For each problem meeting, show only problem events
          const problemEvents = meeting.eventDetails.filter(event => 
            !event.success || event.totalSelections === 0 || event.selectionsWithSectionals < event.totalSelections
          );
          
          if (problemEvents.length > 0) {
            problemEvents.forEach(event => {
              const statusIndicator = event.success ? '✓' : '✗';
              logger.success(`    Event ${event.eventNumber}: ${statusIndicator} - ${event.selectionsWithSectionals}/${event.totalSelections} selections`);
            });
          }
        });
      } else {
        logger.success('All meetings and events processed successfully');
      }
      
      // For meetings with NO event data at all, display a summary warning
      const zeroDataMeetings = overallSummary.meetingDetails.filter(m => m.processedEvents === 0);
      if (zeroDataMeetings.length > 0) {
        logger.warn('Meetings with No Data:');
        zeroDataMeetings.forEach(meeting => {
          logger.warn(`  ${meeting.meetingSlug}: No data retrieved (${meeting.totalEvents} events)`);
        });
      }
      
      logger.success(`-------------------------------`);
      
      // Save overall summary to file
      try {
        const outputDir = path.join(process.cwd(), 'output');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const summaryFile = path.join(outputDir, `${date}_summary.json`);
        fs.writeFileSync(summaryFile, JSON.stringify({
          overallSummary,
          meetings: processingResults
        }, null, 2));
        logger.success(`Overall summary saved to ${summaryFile}`);
      } catch (error) {
        logger.error(`Failed to save overall summary:`, error);
      }
      
    } catch (error) {
      logger.error(`Critical error in test function:`, error);
    }
  } catch (error) {
    logger.error("Critical error in test function:", error);
  }
}

/**
 * Test function for the getForms functionality
 */
const testForms = async () => {
  try {
    // Test with a specific date
    const date = '2025-03-18';
    logger.info(`Running forms scraper for date: ${date}`);
    
    if (!date) {
      logger.error('Date parameter must be provided');
      return;
    }
    
    try {
      // Get all meetings and event selections for the specified date
      logger.info(`Fetching meetings and event selections for date: ${date}`);
      const meetingsData = await getMeetingsOnACertainDate(date);
      
      if (!meetingsData || !meetingsData.meetingSlugs || meetingsData.meetingSlugs.length === 0) {
        logger.error(`No meetings found for date: ${date}`);
        return;
      }
      
      const meetingSlugs = meetingsData.meetingSlugs;
      const eventSelections = meetingsData.eventSelections || [];
      
      logger.success(`Found ${meetingSlugs.length} meetings with ${eventSelections.length} events for date: ${date}`);
      
      // Process each meeting one by one
      const processingResults = [];
      const overallSummary = {
        date,
        totalMeetings: meetingSlugs.length,
        successfulMeetings: 0,
        failedMeetings: 0,
        totalEvents: 0,
        totalSelections: 0,
        totalSelectionsWithForms: 0,
        totalErrors: 0,
        startTime: new Date(),
        endTime: null,
        duration: null,
        meetingDetails: [] // Array to store per-meeting details
      };
      
      // For testing purpose, limit to just the first meeting
      const testLimit = 1;
      const limitedSlugs = meetingSlugs.slice(0, testLimit);
      
      for (let i = 0; i < limitedSlugs.length; i++) {
        const slug = limitedSlugs[i];
        logger.meeting(`Processing meeting for forms: ${slug}`, i + 1, limitedSlugs.length);
        
        try {
          // Use default values for testing
          const eventLimit = 2; // Just process 2 events for testing
          const outputFolder = path.join('output_forms', date);
          const jsonOutputFolder = path.join('output_forms_json', date);
          const csvOutputFolder = path.join('output_forms_csv', date);
          const concurrency = 3;  // Set concurrent event processing to 3
          const formsLimit = 5;   // Number of past forms to fetch per selection
          
          // Create output directories if they don't exist
          [outputFolder, jsonOutputFolder, csvOutputFolder].forEach(folder => {
            if (!fs.existsSync(folder)) {
              fs.mkdirSync(folder, { recursive: true });
            }
          });
          
          // Process the meeting to get forms data, passing the preloaded event selections
          const results = await getForms(
            slug, 
            "punters", 
            "HorseRacing", 
            eventLimit,
            concurrency,
            formsLimit,
            eventSelections
          );
          
          // Export the formatted data
          if (results.formattedData && results.formattedData.length > 0) {
            const formattedOutputFile = path.join(outputFolder, `${slug}_forms_formatted`);
            const { jsonPath, csvPath } = exportFormsData(results.formattedData, { 
              outputFile: formattedOutputFile,
              jsonOutputFolder,
              csvOutputFolder
            });
            
            logger.success(`Formatted forms data exported to JSON: ${jsonPath}`);
            logger.success(`Formatted forms data exported to CSV: ${csvPath}`);
          }
          
          // Add meeting results to overall summary
          if (results.summary) {
            overallSummary.totalEvents += results.summary.totalEvents;
            overallSummary.totalSelections += results.summary.totalSelections;
            overallSummary.totalSelectionsWithForms += results.summary.selectionsWithForms;
            overallSummary.totalErrors += results.summary.errorCount;
            
            // Add meeting to meeting details
            overallSummary.meetingDetails.push({
              meetingSlug: slug,
              totalEvents: results.summary.totalEvents,
              processedEvents: results.summary.processedEvents,
              totalSelections: results.summary.totalSelections,
              selectionsWithForms: results.summary.selectionsWithForms,
              eventDetails: results.summary.eventDetails
            });
          }
          
          processingResults.push({
            meetingSlug: slug,
            success: true,
            summary: results.summary
          });
          
          overallSummary.successfulMeetings++;
          
          logger.success(`Completed processing forms for meeting ${i + 1}/${limitedSlugs.length}: ${slug}`);
        } catch (error) {
          logger.error(`Failed to process forms for meeting ${slug}:`, error);
          processingResults.push({
            meetingSlug: slug,
            success: false,
            error: error.message
          });
          
          overallSummary.failedMeetings++;
          overallSummary.totalErrors++;
        }
      }
      
      // Complete overall summary
      overallSummary.endTime = new Date();
      overallSummary.duration = (overallSummary.endTime - overallSummary.startTime) / 1000;
      
      // Log overall summary
      logger.success(`------- FORMS OVERALL SUMMARY -------`);
      logger.success(`Date: ${overallSummary.date}`);
      logger.success(`Duration: ${overallSummary.duration.toFixed(2)} seconds`);
      logger.success(`Meetings: ${overallSummary.successfulMeetings}/${limitedSlugs.length} successful`);
      logger.success(`Events: ${overallSummary.totalEvents} total, processed ${overallSummary.meetingDetails.reduce((sum, m) => sum + m.processedEvents, 0)}`);
      logger.success(`Selections: ${overallSummary.totalSelections} total, ${overallSummary.totalSelectionsWithForms} with forms`);
      logger.success(`Errors: ${overallSummary.totalErrors}`);
      
      // Save overall summary to file
      try {
        const outputDir = path.join(process.cwd(), 'output_forms');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const summaryFile = path.join(outputDir, `${date}_forms_summary.json`);
        fs.writeFileSync(summaryFile, JSON.stringify({
          overallSummary,
          meetings: processingResults
        }, null, 2));
        logger.success(`Forms overall summary saved to ${summaryFile}`);
      } catch (error) {
        logger.error(`Failed to save forms overall summary:`, error);
      }
      
    } catch (error) {
      logger.error(`Critical error in forms test function:`, error);
    }
  } catch (error) {
    logger.error("Critical error in forms test function:", error);
  }
}

if (require.main === module) {
  //test();
  testForms();
}

module.exports = {
  getSectionals,
  getForms,
  getMeetingsOnACertainDate,
  exportSectionalData,
  exportFormsData
};
