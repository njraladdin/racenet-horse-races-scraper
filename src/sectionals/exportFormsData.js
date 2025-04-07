const fs = require('fs');
const path = require('path');
const { createLogger } = require('../utils');
const logger = createLogger({ timestamps: true });

/**
 * Export forms data to JSON and CSV files
 * @param {Array} formattedData - Array of formatted forms data objects
 * @param {Object} options - Export options
 * @param {string} options.outputFile - Base path for output files (without extension)
 * @param {string} options.jsonOutputFolder - Folder for JSON output
 * @param {string} options.csvOutputFolder - Folder for CSV output
 * @returns {Object} Object with paths to saved files
 */
function exportFormsData(formattedData, options = {}) {
  if (!formattedData || !Array.isArray(formattedData) || formattedData.length === 0) {
    logger.warn('No forms data to export');
    return {
      jsonPath: null,
      csvPath: null
    };
  }

  // Setup output paths
  const {
    outputFile = `forms_data_${new Date().toISOString().replace(/:/g, '-')}`,
    jsonOutputFolder = path.join(process.cwd(), 'output_forms_json'),
    csvOutputFolder = path.join(process.cwd(), 'output_forms_csv')
  } = options;

  // Create output directories if they don't exist
  [jsonOutputFolder, csvOutputFolder].forEach(folder => {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
  });

  // Export to JSON
  const jsonPath = path.join(jsonOutputFolder, `${path.basename(outputFile)}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(formattedData, null, 2));
  logger.debug(`Forms data exported to JSON: ${jsonPath}`);

  // Export to CSV
  const csvPath = path.join(csvOutputFolder, `${path.basename(outputFile)}.csv`);
  
  try {
    // Get headers from all objects to ensure we include all possible columns
    const headers = new Set();
    formattedData.forEach(item => {
      Object.keys(item).forEach(key => headers.add(key));
    });
    
    // Convert headers set to array
    const headerArray = Array.from(headers);
    
    // Create CSV content
    let csvContent = headerArray.join(',') + '\n';
    
    // Add data rows
    formattedData.forEach(item => {
      const row = headerArray.map(header => {
        const value = item[header] !== undefined ? item[header] : '';
        // Handle special characters in CSV by wrapping in quotes and escaping quotes
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvContent += row.join(',') + '\n';
    });
    
    // Write CSV file
    fs.writeFileSync(csvPath, csvContent);
    logger.debug(`Forms data exported to CSV: ${csvPath}`);
    
  } catch (error) {
    logger.error('Error creating CSV file:', error);
    return { jsonPath, csvPath: null };
  }

  return { jsonPath, csvPath };
}

module.exports = exportFormsData; 