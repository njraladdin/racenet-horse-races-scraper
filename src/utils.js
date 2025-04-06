/**
 * Convert array of objects to CSV string
 * @param {Array<Object>} data - Array of objects to convert
 * @returns {string} CSV string
 */
const convertToCsv = (data) => {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  // Get headers from the first object
  const headers = Object.keys(data[0]);
  const headerRow = headers.join(',');

  // Create rows
  const rows = data.map(obj => {
    return headers.map(header => {
      // Convert to string and handle special characters
      const value = obj[header] === null || obj[header] === undefined ? '' : obj[header];
      const valueStr = String(value).replace(/"/g, '""'); // Escape quotes
      
      // Quote values that contain commas, quotes, or newlines
      return /[",\n\r]/.test(valueStr) ? `"${valueStr}"` : valueStr;
    }).join(',');
  });

  // Combine header and rows
  return [headerRow, ...rows].join('\n');
};

// Global configuration object
const globalConfig = {
  SAVE_DEBUG_OUTPUT: true, // Control whether to save debug files to test_output
  SAVE_JSON: true,          // Whether to save JSON output data
  SAVE_CSV: true,           // Whether to save CSV output data
  SAVE_RAW_DATA: false      // Whether to save raw API response data
};

/**
 * Get a global configuration value
 * @param {string} key - Configuration key
 * @returns {any} Configuration value
 */
const getConfig = (key) => globalConfig[key];

/**
 * Set a global configuration value
 * @param {string} key - Configuration key
 * @param {any} value - New value
 * @returns {any} The new value
 */
const setConfig = (key, value) => {
  globalConfig[key] = value;
  return value;
};

/**
 * Logger utility with formatted output
 * @param {Object} options - Logger options
 * @param {boolean} options.timestamps - Whether to include timestamps in log messages
 * @param {boolean} options.debug - Whether to show debug messages
 * @returns {Object} Logger object with various logging methods
 */
const createLogger = (options = {}) => {
  const clc = require('cli-color');
  const { timestamps = true, debug = false } = options;
  
  // Format timestamp for log messages
  const getTimestamp = () => {
    if (!timestamps) return '';
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false });
    return clc.blackBright(`[${time}] `);
  };
  
  // Format prefix with padding for consistent alignment
  const formatPrefix = (prefix, color) => {
    return color(`[${prefix.padEnd(7, ' ')}]`);
  };
  
  return {
    debug: (message) => {
      if (!debug) return;
      console.log(
        getTimestamp() + 
        formatPrefix('DEBUG', clc.cyan) + 
        ' ' + message
      );
    },
    
    info: (message) => {
      console.log(
        getTimestamp() + 
        formatPrefix('INFO', clc.blue) + 
        ' ' + message
      );
    },
    
    success: (message) => {
      console.log(
        getTimestamp() + 
        formatPrefix('SUCCESS', clc.green) + 
        ' ' + message
      );
    },
    
    warn: (message) => {
      console.log(
        getTimestamp() + 
        formatPrefix('WARNING', clc.yellow) + 
        ' ' + message
      );
    },
    
    error: (message, error = null) => {
      console.error(
        getTimestamp() + 
        formatPrefix('ERROR', clc.red) + 
        ' ' + message
      );
      if (error && error.stack) {
        console.error(clc.red(error.stack));
      }
    },
    
    // Special formatted logs for various scraping stages
    meeting: (message, count = null, total = null) => {
      const countInfo = count !== null && total !== null ? ` (${count}/${total})` : '';
      console.log(
        getTimestamp() + 
        formatPrefix('MEETING', clc.magenta) + 
        ' ' + message + clc.magenta(countInfo)
      );
    },
    
    event: (message, count = null, total = null) => {
      const countInfo = count !== null && total !== null ? ` (${count}/${total})` : '';
      console.log(
        getTimestamp() + 
        formatPrefix('EVENT', clc.cyan) + 
        ' ' + message + clc.cyan(countInfo)
      );
    },
    
    selection: (message, count = null, total = null) => {
      const countInfo = count !== null && total !== null ? ` (${count}/${total})` : '';
      console.log(
        getTimestamp() + 
        formatPrefix('SELECT', clc.blue) + 
        ' ' + message + clc.blue(countInfo)
      );
    },
    
    progress: (step, current, total, completedChar = '■', incompleteChar = '□') => {
      const percent = Math.round((current / total) * 100);
      const width = 30;
      const completed = Math.round((width * current) / total);
      const incomplete = width - completed;
      
      const bar = clc.green(completedChar.repeat(completed)) + 
                 clc.blackBright(incompleteChar.repeat(incomplete));
      
      console.log(
        getTimestamp() + 
        formatPrefix('PROGRESS', clc.yellow) + 
        ` ${step}: ${bar} ${percent}% (${current}/${total})`
      );
    }
  };
};

module.exports = {
  convertToCsv,
  createLogger,
  getConfig,
  setConfig
}; 