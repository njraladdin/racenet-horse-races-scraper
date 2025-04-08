const express = require('express');
const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');
const exphbs = require('express-handlebars');

// Create Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Helper functions that will be used both in handlebars and directly
const formatDate = function(date) {
  return moment(date).format('YYYY-MM-DD HH:mm:ss');
};

const formatFileSize = function(size) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let fileSize = size;
  let unitIndex = 0;
  
  while (fileSize > 1024 && unitIndex < units.length - 1) {
    fileSize /= 1024;
    unitIndex++;
  }
  
  return `${fileSize.toFixed(2)} ${units[unitIndex]}`;
};

// Set up Handlebars as the template engine
app.engine('handlebars', exphbs.engine({
  defaultLayout: 'main',
  helpers: {
    formatDate,
    formatFileSize,
    eq: function(a, b) {
      return a === b;
    }
  }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, '../views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Base data directories
const DATA_DIR = path.join(__dirname, '../data');

// Sectional data directories
const DAILY_JSON_DIR = path.join(DATA_DIR, 'output_json_daily');
const DAILY_CSV_DIR = path.join(DATA_DIR, 'output_csv_daily');
const HISTORICAL_JSON_DIR = path.join(DATA_DIR, 'output_json_historical');
const HISTORICAL_CSV_DIR = path.join(DATA_DIR, 'output_csv_historical');

// Forms data directories
const FORMS_DAILY_JSON_DIR = path.join(DATA_DIR, 'output_forms_json_daily');
const FORMS_DAILY_CSV_DIR = path.join(DATA_DIR, 'output_forms_csv_daily');
const FORMS_HISTORICAL_JSON_DIR = path.join(DATA_DIR, 'output_forms_json_historical');
const FORMS_HISTORICAL_CSV_DIR = path.join(DATA_DIR, 'output_forms_csv_historical');

// Helper function to get all dates with meetings
function getDatesWithMeetings(baseDir) {
  if (!fs.existsSync(baseDir)) return [];
  
  return fs.readdirSync(baseDir)
    .filter(item => {
      const itemPath = path.join(baseDir, item);
      return fs.statSync(itemPath).isDirectory();
    })
    .sort((a, b) => b.localeCompare(a)); // Sort dates in descending order (newest first)
}

// Helper function to get meetings for a specific date
function getMeetingsForDate(baseDir, date) {
  const datePath = path.join(baseDir, date);
  if (!fs.existsSync(datePath)) return [];
  
  return fs.readdirSync(datePath)
    .map(filename => {
      const filePath = path.join(datePath, filename);
      const stats = fs.statSync(filePath);
      
      return {
        name: filename,
        path: filePath,
        size: stats.size,
        lastModified: stats.mtime
      };
    })
    .sort((a, b) => b.lastModified - a.lastModified); // Sort by last modified (newest first)
}

// Format meeting data for API response
function formatMeetingsForApi(meetings) {
  return meetings.map(meeting => ({
    name: meeting.name,
    size: meeting.size,
    lastModified: meeting.lastModified,
    sizeFormatted: formatFileSize(meeting.size),
    lastModifiedFormatted: formatDate(meeting.lastModified)
  }));
}

// Main dashboard route
app.get('/', (req, res) => {
  // Get all available dates for sectional data
  const dailyDates = getDatesWithMeetings(DAILY_CSV_DIR);
  const historicalDates = getDatesWithMeetings(HISTORICAL_CSV_DIR);
  
  // Get all available dates for forms data
  const formsDailyDates = getDatesWithMeetings(FORMS_DAILY_CSV_DIR);
  const formsHistoricalDates = getDatesWithMeetings(FORMS_HISTORICAL_CSV_DIR);
  
  // Get the most recent date's meetings for sectional data
  const latestDailyMeetings = dailyDates.length > 0 
    ? getMeetingsForDate(DAILY_CSV_DIR, dailyDates[0])
    : [];
  
  const latestHistoricalMeetings = historicalDates.length > 0
    ? getMeetingsForDate(HISTORICAL_CSV_DIR, historicalDates[0])
    : [];
  
  // Get the most recent date's meetings for forms data
  const latestFormsDailyMeetings = formsDailyDates.length > 0 
    ? getMeetingsForDate(FORMS_DAILY_CSV_DIR, formsDailyDates[0])
    : [];
  
  const latestFormsHistoricalMeetings = formsHistoricalDates.length > 0
    ? getMeetingsForDate(FORMS_HISTORICAL_CSV_DIR, formsHistoricalDates[0])
    : [];
  
  res.render('dashboard', {
    // Sectional data
    dailyDates,
    weeklyDates: historicalDates,
    latestDailyDate: dailyDates[0] || null,
    latestWeeklyDate: historicalDates[0] || null,
    latestDailyMeetings,
    latestWeeklyMeetings: latestHistoricalMeetings,
    
    // Forms data
    formsDailyDates,
    formsWeeklyDates: formsHistoricalDates,
    latestFormsDailyDate: formsDailyDates[0] || null,
    latestFormsWeeklyDate: formsHistoricalDates[0] || null,
    latestFormsDailyMeetings,
    latestFormsWeeklyMeetings: latestFormsHistoricalMeetings
  });
});

// API route to get daily meetings for a specific date
app.get('/api/daily/:date', (req, res) => {
  const date = req.params.date;
  const meetings = getMeetingsForDate(DAILY_CSV_DIR, date);
  res.json(formatMeetingsForApi(meetings));
});

// API route to get historical meetings for a specific date
app.get('/api/weekly/:date', (req, res) => {
  const date = req.params.date;
  const meetings = getMeetingsForDate(HISTORICAL_CSV_DIR, date);
  res.json(formatMeetingsForApi(meetings));
});

// API route to get forms daily meetings for a specific date
app.get('/api/forms-daily/:date', (req, res) => {
  const date = req.params.date;
  const meetings = getMeetingsForDate(FORMS_DAILY_CSV_DIR, date);
  res.json(formatMeetingsForApi(meetings));
});

// API route to get forms historical meetings for a specific date
app.get('/api/forms-weekly/:date', (req, res) => {
  const date = req.params.date;
  const meetings = getMeetingsForDate(FORMS_HISTORICAL_CSV_DIR, date);
  res.json(formatMeetingsForApi(meetings));
});

// Route to download a file
app.get('/download/:type/:date/:filename', (req, res) => {
  const { type, date, filename } = req.params;
  
  let baseDir;
  
  // Determine the appropriate directory based on type
  switch (type) {
    case 'daily':
      baseDir = DAILY_CSV_DIR;
      break;
    case 'weekly':
      baseDir = HISTORICAL_CSV_DIR;
      break;
    case 'forms-daily':
      baseDir = FORMS_DAILY_CSV_DIR;
      break;
    case 'forms-weekly':
      baseDir = FORMS_HISTORICAL_CSV_DIR;
      break;
    default:
      return res.status(400).send('Invalid type specified');
  }
  
  const filePath = path.join(baseDir, date, filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

// Start server
app.listen(PORT, () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Display all available IP addresses
  console.log('Available on:');
  Object.keys(networkInterfaces).forEach(interfaceName => {
    const interfaces = networkInterfaces[interfaceName];
    interfaces.forEach(iface => {
      // Skip internal and non-IPv4 addresses
      if (!iface.internal && iface.family === 'IPv4') {
        console.log(`http://${iface.address}:${PORT}`);
      }
    });
  });
});
