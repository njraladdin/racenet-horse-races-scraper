# Horse Racing Sectional Data Viewer

A web application to view and download scraped horse racing sectional data from racenet.com.au

## Features

- View data scraped from daily races
- View data scraped from past week races
- Download CSV files for each meeting
- Trigger new data scraping operations

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Run the server:
   ```
   node src/server.js
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Running the Scrapers

- To scrape daily race data:
  ```
  node scrapeNewData.js
  ```

- To scrape historical race data:
  ```
  node scrapeHistoricalData.js
  ```

## Data Structure

Data is organized in the following structure:

- `data/output_csv_daily/YYYY-MM-DD/`: Daily scraped CSV files
- `data/output_json_daily/YYYY-MM-DD/`: Daily scraped JSON files
- `data/output_csv_weekly/YYYY-MM-DD/`: Weekly scraped CSV files
- `data/output_json_weekly/YYYY-MM-DD/`: Weekly scraped JSON files

## How It Works

The scraper follows this optimized process:

1. **Get meetings and events**: Fetch all race meetings and their events for a given date in a single API call
2. **Get sectionals**: For each horse (selection), fetch historical sectional timing data
3. **Export data**: Save everything to JSON and CSV files

### Performance Optimization

The system uses an optimized data retrieval approach that:
- Fetches both meeting slugs and event selections in a single API call
- Reduces network requests by approximately 2/3
- Preloads event data to avoid multiple API calls during processing
- Uses the RaceNet GraphQL API for more efficient data retrieval

## Usage

```javascript
// Scrape by date - returns both meeting slugs and event selections
const date = '2025-03-18';
const { meetingSlugs, eventSelections } = await getMeetingsOnACertainDate(date);

// Scrape by meeting slug with preloaded event selections
const results = await getSectionals("rosehill-20250401", "punters", "HorseRacing", null, 5, eventSelections); 
```

## Output Files

The scraper generates two files in the `output` directory:
- `[meeting-slug]_sectionals.json`: Complete raw data
- `[meeting-slug]_formatted.csv`: Formatted tabular data 

## Data Structure

```
{
  "meeting": {              // Meeting information
    "slug": "rosehill-20250401",
    "name": "Rosehill",
    "date": "2025-04-01"
  },
  "events": {               // All races by ID
    "1927887": {            // Race 1
      "eventNumber": 1,
      "slug": "midway-bm72-race-1",
      "selectionIds": ["19273313", ...]  // Horses in this race
    }
  },
  "selections": {           // All horses by ID
    "19273313": {           // Horse 1
      "competitorName": "Mahogany Girl",
      "jockeyName": "Chad Lever",
      "eventId": "1927887", // Reference to the horse's race
      "sectionals": [       // Historical sectional times
        {
          "raceId": "11060832",
          "meetingDate": "2025-03-08",
          "sectionalTime": { ... }
        },
        ...
      ]
    },
    "19273316": { ... }     // Horse 2
  }
}
```

### Entity Relationships:
- **Meeting** contains multiple **Events** (races)
- **Events** contain multiple **Selections** (horses)
- **Selections** belong to a single **Event** and have **Sectional Times**

### Helper Functions:
- `getSelectionsForEvent(results, eventId)`: Returns all selections for a specific event
- `getEventByNumber(results, eventNumber)`: Finds an event by its race number

## Output

The module produces:
- JSON data with detailed sectional timing information
- Optional CSV format with the most relevant fields

Output files are saved to the `output` directory:
- `[meeting-slug]_sectionals.json`: Complete data for the meeting
- `formatted_sectionals.csv`: Simplified tabular data (optional)

## Structure

- `src/index.js` - Main entry point and exports
- `src/sectionals/` - Core functionality
  - `getMeetingsOnACertainDate.js` - Gets meeting slugs and event selections for a date
  - `getEventsIdsForAMeeting.js` - Retrieves events for a meeting (fallback method)
  - `getSelectionsForAnEvent.js` - Gets horse selections for an event (fallback method)
  - `getSelectionsResults.js` - Fetches sectional times for selections
  - `index.js` - Combines all functions and handles data processing

## Example Usage

```javascript
const { getSectionals, getMeetingsOnACertainDate } = require('./src/sectionals');

// Get meeting slugs and events for a date
const { meetingSlugs, eventSelections } = await getMeetingsOnACertainDate('2025-03-18');

// Get all data for a meeting using preloaded events
const results = await getSectionals("rosehill-20250401", "punters", "HorseRacing", null, 5, eventSelections);

// Get race 1 by looking up its event number
const race1 = getEventByNumber(results, 1);

// Get all horses in race 1
const horsesInRace1 = getSelectionsForEvent(results, race1.id);

// Access a specific horse and its sectional data
const horse = results.selections["19273313"];
const sectionals = horse.sectionals;
```

## Example Data

The JSON output contains detailed information about races, horses, and their sectional timing data.

The CSV output includes:
- Event information (number, URL, start time)
- Horse details (name, weight, jockey)
- Sectional times at different distances 
- Speed data for each section 