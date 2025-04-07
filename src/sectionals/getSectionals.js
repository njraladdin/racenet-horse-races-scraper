
const fs = require('fs');
const path = require('path');
const clc = require('cli-color');
const pLimit = require('p-limit');
const getEventsIdsForAMeeting = require('./getEventsIdsForAMeeting');
const {getSelectionsForAnEvent} = require('./getSelectionsForAnEvent');
const getSelectionsResults = require('./getSelectionsResults');
const formatSectionalData = require('./formatSectionalData');
const exportSectionalData = require('./exportSectionalData');
const formatFormsData = require('./formatFormsData');
const exportFormsData = require('./exportFormsData');
const getMeetingsOnACertainDate = require('./getMeetingsOnACertainDate');
const { getSelectionsForms } = require('./getSelectionsForms');
const { createLogger } = require('../utils');

// Create an enhanced logger
const logger = createLogger({ timestamps: true, debug: true });


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

  module.exports = getSectionals;