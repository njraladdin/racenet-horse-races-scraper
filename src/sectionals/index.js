const fs = require('fs');
const path = require('path');
const clc = require('cli-color');
const pLimit = require('p-limit');
const getEventsIdsForAMeeting = require('./getEventsIdsForAMeeting');
const {getSelectionsForAnEvent} = require('./getSelectionsForAnEvent');
const getSelectionsResults = require('./getSelectionsResults');
const formatSectionalData = require('./formatSectionalData');
const exportSectionalData = require('./exportSectionalData');
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
 * @param {number} concurrency - Number of concurrent event processing (default: 3)
 * @param {Array} preloadedEventSelections - Optional preloaded event selections data
 * @returns {Promise<Object>} Object containing sectional times and formatted data for all events in the meeting
 */
async function getSectionals(
  meetingSlug, 
  brand = "punters", 
  sport = "HorseRacing", 
  eventLimit = null,
  concurrency = 5,
  preloadedEventSelections = null
) {
  if (!meetingSlug) {
    throw new Error('Meeting slug is required');
  }
  
  try {
    // Initialize results structure
    const results = {
      meeting: {
        slug: meetingSlug,
        url: `https://www.racenet.com.au/form-guide/horse-racing/${meetingSlug}/`,
      },
      events: {},
      selections: {},
      errors: [] // Track errors that occurred during processing
    };
    
    // Initialize summary stats
    const summary = {
      meetingSlug,
      totalEvents: 0,
      processedEvents: 0,
      totalSelections: 0,
      selectionsWithSectionals: 0,
      errorCount: 0,
      startTime: new Date(),
      endTime: null,
      duration: null,
      eventDetails: [] // Array to store per-event details
    };
    
    let events = [];
    
    // Check if we have preloaded event selections data for this meeting
    if (preloadedEventSelections && preloadedEventSelections.length > 0) {
      logger.info(`Using preloaded event selections data for meeting: ${meetingSlug}`);
      
      // Filter event selections for this meeting slug
      const meetingEvents = preloadedEventSelections.filter(
        eventData => eventData.meetingSlug === meetingSlug
      );
      
      if (meetingEvents.length > 0) {
        // Process the preloaded event selections data
        logger.success(`Found ${meetingEvents.length} preloaded events for meeting: ${meetingSlug}`);
        logger.info(`OPTIMIZATION: Skipping getEventsIdsForAMeeting and getSelectionsForAnEvent API calls by using preloaded data`);
        
        // Set up the events data in the format expected by the rest of the function
        events = meetingEvents.map(eventData => ({
          id: eventData.eventDetails.id,
          eventNumber: eventData.eventDetails.eventNumber,
          slug: eventData.eventDetails.slug || `race-${eventData.eventDetails.eventNumber}`,
          name: eventData.eventDetails.name,
          distance: eventData.eventDetails.distance,
          eventClass: eventData.eventDetails.eventClass,
          selections: eventData.selections
        }));
        
        // Update meeting details if available
        if (meetingEvents[0]) {
          results.meeting = {
            ...results.meeting,
            id: meetingEvents[0].meetingId,
            name: meetingEvents[0].meetingName,
            state: meetingEvents[0].meetingState,
          };
        }
      } else {
        logger.warn(`No preloaded events found for meeting: ${meetingSlug}, falling back to API calls`);
      }
    }
    
    // If no preloaded data, fetch events the traditional way
    if (events.length === 0) {
      // Step 1: Get all events for the given meeting
      logger.meeting(`Fetching events for meeting: ${meetingSlug}`);
      let eventsData;
      try {
        eventsData = await getEventsIdsForAMeeting(meetingSlug, brand, sport);
      } catch (error) {
        logger.error(`Failed to fetch events for meeting: ${meetingSlug}`, error);
        results.errors.push({
          step: 'getEventsIdsForAMeeting',
          message: error.message,
          timestamp: new Date().toISOString()
        });
        return results; // Return early with error info
      }
      
      if (!eventsData.parsedOutput.events || !eventsData.parsedOutput.events.length) {
        logger.warn(`No events found for meeting: ${meetingSlug}`);
        return results;
      }
      
      // Update results with meeting details and events
      results.meeting = {
        ...results.meeting,
        ...eventsData.parsedOutput.meeting
      };
      
      // Use the fetched events
      events = eventsData.parsedOutput.events;
    }
    
    // Apply event limit if specified
    if (eventLimit && eventLimit > 0 && eventLimit < events.length) {
      logger.info(`Limiting processing to first ${eventLimit} events (out of ${events.length})`);
      events = events.slice(0, eventLimit);
    }
    
    logger.success(`Processing ${events.length} events for meeting: ${meetingSlug}`);
    
    // Step 2: Process events concurrently with p-limit
    logger.info(`Processing events concurrently (max ${concurrency} at a time)...`);
    
    // Set up the concurrency limit
    const limit = pLimit(concurrency);
    
    // Track processing progress
    let processedEvents = 0;
    const totalEvents = events.length;
    
    // Create an array of promises for concurrent processing
    const promises = events.map(event => {
      return limit(async () => {
        processedEvents++;
        logger.event(`Processing event ${event.eventNumber}: ${event.slug}`, processedEvents, totalEvents);
        
        // Store event in results by ID
        results.events[event.id] = event;
        
        // Check if we already have selections from preloaded data
        let eventSelections = event.selections || null;
        
        // If we don't have preloaded selections, fetch them
        if (!eventSelections) {
          // Get selections for this event
          let selectionsData;
          try {
            logger.info(`No preloaded selections for event ${event.id}, fetching via API`);
            selectionsData = await getSelectionsForAnEvent(event.id, brand);
            eventSelections = selectionsData.parsedData.selections;
            
            // Store detailed event info
            results.events[event.id] = {
              ...results.events[event.id],
              details: selectionsData.parsedData.eventDetails
            };
          } catch (error) {
            logger.error(`Failed to fetch selections for event ${event.eventNumber}: ${event.slug}`, error);
            results.errors.push({
              step: 'getSelectionsForAnEvent',
              eventId: event.id,
              message: error.message,
              timestamp: new Date().toISOString()
            });
            return null; // Skip to next event
          }
        }
        
        if (!eventSelections || eventSelections.length === 0) {
          logger.warn(`No valid selections found for event ${event.id} - skipping sectional data processing`);
          return null;
        }
        
        // Extract selection IDs to fetch sectional times
        const selectionIds = eventSelections.map(selection => selection.id);
        
        // Add selectionIds to the event for easy reference
        results.events[event.id].selectionIds = selectionIds;
        
        // Store selections with their basic info
        eventSelections.forEach(selection => {
          results.selections[selection.id] = {
            ...selection,
            eventId: event.id
          };
        });
        
        // Step 3: Fetch sectional times for selections
        if (selectionIds.length > 0) {
          logger.selection(`Fetching sectional times for ${selectionIds.length} selections in event ${event.id}`);
          logger.debug(JSON.stringify(selectionIds));
          try {
            const sectionalData = await getSelectionsResults(selectionIds);
            
            // Add sectional data to each selection
            for (const selectionId in sectionalData) {
              if (results.selections[selectionId]) {
                results.selections[selectionId].sectionals = sectionalData[selectionId];
              }
            }
            
            const processedSelections = Object.keys(sectionalData).length;
            const totalSelections = selectionIds.length;
            logger.success(`Retrieved ${processedSelections}/${totalSelections} selection results for event ${event.id}`);
            
            // Display progress
            logger.progress('Event processing', processedEvents, totalEvents);
            
          } catch (error) {
            logger.error(`Error fetching sectionals for selections in event ${event.id}:`, error);
            results.errors.push({
              step: 'getSelectionsResults',
              eventId: event.id,
              selectionIds: selectionIds,
              message: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }
        
        return { eventId: event.id, processed: true };
      });
    });
    
    // Wait for all events to be processed
    await Promise.all(promises);
    
    // Format the data
    const formattedData = formatSectionalData(results);
    
    // Add formatted data to results
    results.formattedData = formattedData;
    
    // Update summary information
    summary.totalEvents = Object.keys(results.events).length;
    summary.processedEvents = Object.keys(results.events).filter(eventId => 
      results.events[eventId].selectionIds && results.events[eventId].selectionIds.length > 0
    ).length;
    summary.totalSelections = Object.keys(results.selections).length;
    summary.selectionsWithSectionals = Object.values(results.selections)
      .filter(selection => selection.sectionals && selection.sectionals.length > 0)
      .length;
    summary.errorCount = results.errors.length;
    summary.endTime = new Date();
    summary.duration = (summary.endTime - summary.startTime) / 1000; // Duration in seconds
    
    // Build detailed event breakdown
    Object.keys(results.events).forEach(eventId => {
      const event = results.events[eventId];
      const eventSelections = event.selectionIds || [];
      const selectionsWithSectionalData = eventSelections.filter(selectionId => 
        results.selections[selectionId] && 
        results.selections[selectionId].sectionals && 
        results.selections[selectionId].sectionals.length > 0
      );
      
      summary.eventDetails.push({
        eventId,
        eventNumber: event.eventNumber,
        eventName: event.slug,
        totalSelections: eventSelections.length,
        selectionsWithSectionals: selectionsWithSectionalData.length,
        success: eventSelections.length > 0
      });
    });
    
    // Sort events by number
    summary.eventDetails.sort((a, b) => a.eventNumber - b.eventNumber);
    
    // Log summary of results
    logger.info(`Summary: Processed ${events.length} events, ${summary.totalSelections} selections`);
    logger.info(`Found sectional data for ${summary.selectionsWithSectionals}/${summary.totalSelections} selections`);
    
    // Log summary of errors if any
    if (results.errors.length > 0) {
      logger.warn(`Completed with ${results.errors.length} errors. Check the output file for details.`);
    }
    
    // Log the full summary
    logger.info('Processing Summary:');
    logger.info('------------------');
    logger.info(`Meeting: ${summary.meetingSlug}`);
    logger.info(`Duration: ${summary.duration.toFixed(2)} seconds`);
    logger.info(`Events: ${summary.processedEvents}/${summary.totalEvents} processed`);
    logger.info(`Selections: ${summary.totalSelections} total, ${summary.selectionsWithSectionals} with sectionals`);
    logger.info(`Errors: ${summary.errorCount}`);
    
    // Log only problematic events
    const problemEvents = summary.eventDetails.filter(event => !event.success || event.totalSelections === 0 || event.selectionsWithSectionals < event.totalSelections);
    if (problemEvents.length > 0) {
      logger.info('Problem Events:');
      problemEvents.forEach(event => {
        const statusIndicator = event.success ? '✓' : '✗';
        logger.info(`  Event ${event.eventNumber} (${event.eventName}): ${statusIndicator} - ${event.selectionsWithSectionals}/${event.totalSelections} selections with sectional data`);
      });
    } else {
      logger.info('All events processed successfully with complete data');
    }
    logger.info('------------------');
    
    // Add summary to results
    results.summary = summary;

    return results;
  } catch (error) {
    logger.error(`Error getting sectionals for meeting ${meetingSlug}:`, error);
    throw error;
  }
}

module.exports = {
  getSectionals,
  getMeetingsOnACertainDate,
  exportSectionalData
}; 

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

if (require.main === module) {
  test();
}
