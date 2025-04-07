/**
 * Format forms data for export
 * @param {Object} results - The results object from getForms
 * @returns {Array} Array of formatted forms data objects
 */
function formatFormsData(results) {
  if (!results || !results.selections) {
    return [];
  }

  const formattedData = [];

  // Get meeting info for reference
  const meetingInfo = results.meeting || {};
  
  // Process each event
  Object.keys(results.events).forEach(eventId => {
    const event = results.events[eventId];
    
    // Skip events without selections
    if (!event.selectionIds || event.selectionIds.length === 0) {
      return;
    }
    
    // Process each selection in this event
    event.selectionIds.forEach(selectionId => {
      const selection = results.selections[selectionId];
      
      // Skip selections without forms
      if (!selection || !selection.forms || selection.forms.length === 0) {
        return;
      }
      
      // Process each form entry for this selection
      selection.forms.forEach(form => {
        // Create a formatted data object with meeting, event, and selection info
        const formattedEntry = {
          // Meeting data
          meetingId: meetingInfo.id || '',
          meetingName: meetingInfo.name || '',
          meetingState: meetingInfo.state || '',
          meetingSlug: meetingInfo.slug || '',
          
          // Event data
          eventId: event.id,
          eventNumber: event.eventNumber,
          eventName: event.name || '',
          eventSlug: event.slug || '',
          eventDistance: event.distance || '',
          eventClass: event.eventClass || '',
          
          // Selection data
          selectionId: selectionId,
          selectionNumber: selection.number || '',
          horseName: selection.name || form["Horse Name"] || '',
          
          // Form data - include all properties from the form
          ...form
        };
        
        formattedData.push(formattedEntry);
      });
    });
  });

  return formattedData;
}

module.exports = formatFormsData; 