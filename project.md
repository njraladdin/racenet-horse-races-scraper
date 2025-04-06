
https://www.punters.com.au/form-guide/horses/rockhampton-20241029/tab-bm65-race-1/#sectionaltimes
click a horse, get seconds

i need this info https://docs.google.com/spreadsheets/d/1mlpI4I1J8Cp14yW1V2GE7KbeUItl_dz1ZyZo4nz_nK8/edit?usp=sharing

have 4 years of data and run daily

beyond race 3 r3 require paid account

historical data
https://www.punters.com.au/racing-results/2025-03-17/

only scrape australian races

race forum guide page: https://www.punters.com.au/form-guide/horses/newcastle-20250401/the-adviser-collective-hcp-c1-race-7/#overview
you can find event id
div class="form-guide-event" data-event-id="1925325" data-meeting-id="301116" data-v-683c5b64><main class

----


- use meetingbyslug operationname endpoint to get event id for a certain day, done
- use geteventbyid endpoint to get horses selection ids, done
- use getsectionalsbyselectionids endpoint to get sectionals data, done
- create main module that would receive racetrack-date slug and output sectionals, done
- organize data in a results object, done 
- format and keep only relevant sectionals data, done 
- output data in csv as in the requirements, done 


- create module that scrapes meetings slugs from  the result page with a date input, done 
- refactor index.js, done 

- fix PERSISTED_QUERY_NOT_FOUND issue, done  
- add better logs to track progress, to track fetched data and detect errors, done 
- add concurrency, done 
- add result summary and error count and save it in output, done 

- use modal scrape last week, done 


- set up version that scrapes past week, done 
- set up version that continously keeps scraping new data, done 
- add interface to see current files and progress, done 
- be able to download zipfile of all data from interface, done
- remove irrelevant fields, done


- switch repo, done 
- host on digital ocean and test
- run it to scrape past 4 years 

