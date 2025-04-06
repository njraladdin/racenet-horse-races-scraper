const fs = require('fs');
const path = require('path');
const { convertToCsv, createLogger } = require('../utils');

// Create a module-specific logger
const logger = createLogger({ timestamps: true, debug: false });

/**
 * Export sectional data to JSON and/or CSV files
 * @param {Object} data - Object containing raw results and formatted data
 * @param {Array} [data.formattedData] - Formatted sectional data array from formatSectionalData
 * @param {Object} [data.rawResults] - Complete raw results object from getSectionals
 * @param {Object} options - Export options
 * @param {string|null} options.outputFile - Base file path without extension (null to skip file export)
 * @param {string|null} options.jsonOutputFolder - Folder for JSON output (overrides path in outputFile)
 * @param {string|null} options.csvOutputFolder - Folder for CSV output (overrides path in outputFile)
 * @param {boolean} options.includeJson - Whether to export formatted data as JSON (default: true)
 * @param {boolean} options.includeCsv - Whether to export formatted data as CSV (default: true)
 * @param {boolean} options.includeRawData - Whether to export raw results data (default: false)
 * @returns {Object} Object containing paths to saved files
 */
const exportSectionalData = (data, options = {}) => {
  const { 
    outputFile = null,
    jsonOutputFolder = null,
    csvOutputFolder = null,
    includeJson = true,
    includeCsv = true,
    includeRawData = false
  } = options;
  
  // Handle both previous and new function signature
  const formattedData = Array.isArray(data) ? data : data.formattedData || [];
  const rawResults = !Array.isArray(data) ? data.rawResults || null : null;
  
  const result = { jsonPath: null, csvPath: null, rawJsonPath: null };
  
  // Return early if no data
  if ((!formattedData || formattedData.length === 0) && (!rawResults)) {
    logger.warn('No data to export');
    return result;
  }
  
  // Skip export if outputFile is null
  if (outputFile === null) {
    logger.info('Skipping file export (outputFile is null)');
    return result;
  }
  
  // Get the base filename without path or existing suffix
  const outputPath = path.dirname(outputFile);
  const baseFilename = path.basename(outputFile).replace('_formatted', '');
  
  // Save formatted data as JSON if requested
  if (includeJson && formattedData.length > 0) {
    let jsonPath;
    
    if (jsonOutputFolder) {
      // Ensure JSON directory exists
      if (!fs.existsSync(jsonOutputFolder)) {
        fs.mkdirSync(jsonOutputFolder, { recursive: true });
      }
      jsonPath = path.join(jsonOutputFolder, `${baseFilename}_formatted.json`);
    } else {
      // Use original path
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      jsonPath = `${outputFile}_formatted.json`;
    }
    
    fs.writeFileSync(jsonPath, JSON.stringify(formattedData, null, 2));
    logger.debug(`Formatted data exported as JSON to ${jsonPath}`);
    result.jsonPath = jsonPath;
  }
  
  // Save raw results data if requested
  if (includeRawData && rawResults) {
    let rawJsonPath;
    
    if (jsonOutputFolder) {
      // Ensure JSON directory exists
      if (!fs.existsSync(jsonOutputFolder)) {
        fs.mkdirSync(jsonOutputFolder, { recursive: true });
      }
      rawJsonPath = path.join(jsonOutputFolder, `${baseFilename}_raw.json`);
    } else {
      // Use original path
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      rawJsonPath = path.join(outputDir, `${baseFilename}_raw.json`);
    }
    
    fs.writeFileSync(rawJsonPath, JSON.stringify(rawResults, null, 2));
    logger.debug(`Raw data exported as JSON to ${rawJsonPath}`);
    result.rawJsonPath = rawJsonPath;
  }
  
  // Save formatted data as CSV if requested
  if (includeCsv && formattedData.length > 0) {
    let csvPath;
    
    if (csvOutputFolder) {
      // Ensure CSV directory exists
      if (!fs.existsSync(csvOutputFolder)) {
        fs.mkdirSync(csvOutputFolder, { recursive: true });
      }
      csvPath = path.join(csvOutputFolder, `${baseFilename}_formatted.csv`);
    } else {
      // Use original path
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      csvPath = `${outputFile}_formatted.csv`;
    }
    
    const csvData = convertToCsv(formattedData);
    fs.writeFileSync(csvPath, csvData, 'utf8');
    logger.debug(`Formatted data exported as CSV to ${csvPath}`);
    result.csvPath = csvPath;
  }
  
  if (formattedData.length > 0) {
    logger.success(`Exported ${formattedData.length} formatted records`);
  }
  
  if (includeRawData && rawResults) {
    logger.success(`Exported raw results data`);
  }
  
  return result;
};

module.exports = exportSectionalData; 