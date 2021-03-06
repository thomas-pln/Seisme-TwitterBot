const Twitter = require('twit');
const axios = require('axios');
const buildUrl = require('build-url');
const SeismicDB = require('./db');
require('dotenv').config();

const MAXIMAL_LATITUDE = '51.09';
const MAXIMAL_LONGITUDE = '9.80';
const MINIMAL_LATITUDE = '41.34';
const MINIMAL_LONGITUDE = '-5.57';

const FS_API_HOST = 'https://api.franceseisme.fr/';
const FS_API_PATH = 'fdsnws/event/1/query';

const GEO_API_HOST = 'http://nominatim.openstreetmap.org';
const GEO_API_PATH = 'reverse';

const LAUNCH_TIME = new Date();
let BOT_NAME;

process.env.TZ = 'Europe/Paris'

const DB = new SeismicDB();

const twitter = new Twitter({
    consumer_key: process.env.TWIT_CONSUMER_KEY,
    consumer_secret: process.env.TWIT_CONSUMER_SECRET,
    access_token: process.env.TWIT_ACCESS_TOKEN,
    access_token_secret: process.env.TWIT_ACCESS_TOKEN_SECRET
});

console.log('Node version: ' + process.version);

/**
 * Vérification de la connexion token - API
 */
twitter.get('account/verify_credentials', {
    include_entities: false,
    skip_status: true,
    include_email: false
}, (err, data) => {
    if (err) console.log(err);
    else {
        console.log(`Connecté avec succès. -- ${new Date().toString()}`);
        console.log('Bot Tag: ' + data.screen_name)
        BOT_NAME = data.screen_name;
    }
});

/**
 * Get seismic events of the last minute and tweet it
 */
const main = async () => {
    let events = await getEvents();

    for (let event of events) {
        let dbEvent = await DB.getEvent(event.id);

        // New event
        if (!dbEvent && event.properties.automatic) 
            tweetNewEvent(event);

        // Validated event
        else if (dbEvent && !event.properties.automatic && event.properties.type != 'quarry blast' && !dbEvent.validated)
            tweetValidatedEvent(event, dbEvent.tweetID);
        
        // New validated event
        else if (!dbEvent && !event.properties.automatic && event.properties.type != 'quarry blast')
            tweetValidatedEvent(event);
    }
}

/**
 * Tweet for the new event and store it in db
 *  @param {*} event Seismic event
 */
const tweetNewEvent = async (event) => {
    let tweetContent = createBasicTweetContent(event);
    tweetContent += '\nVérifié: ⏳ (En attente de validation)';
    let eventTime = (new Date(event.properties.time)).getTime();

    console.log(`TWEET NEW EVENT: ${event.id}`);
    let tweetID = await postTweet(tweetContent);
    DB.insertEvent(event.id, tweetID, eventTime, false);
}

/**
 * Tweet for the validated event and store it in db
 *  @param {*} event Seismic event
 *  @param {string} tweetID Initial tweet of the event
 */
const tweetValidatedEvent = async (event, tweetID) => {
    let tweetContent = createBasicTweetContent(event);
    tweetContent += '\nVérifié: ✅';
    tweetContent += '\n_______\n'
    tweetContent += await createTags(event);

    console.log(`TWEET VALIDATED EVENT: ${event.id}`);
    let newTweetID = await postTweet(tweetContent, tweetID);

    if (tweetID) DB.setEventValidated(event.id);
    else {
        let eventTime = (new Date(event.properties.time)).getTime();
        DB.insertEvent(event.id, newTweetID, eventTime, true);
    }
}

/**
 * Create the basic tweet content
 * @param {*} event 
 * @returns Basic tweet contant
 */
const createBasicTweetContent = (event) => {
    let tweetContent = '';
    let eventDate = new Date(event.properties.time);

    tweetContent += `💥 ${event.properties.description.fr}\n`;
    tweetContent += `⏰ ${eventDate.toLocaleDateString()} à ${formatTime(eventDate)}\n`;
    tweetContent += `🧭 Latitude ${event.geometry.coordinates[1].toFixed(2)} Longitude ${event.geometry.coordinates[0].toFixed(2)}\n`;
    tweetContent += `💻 ${event.properties.url.fr}`;
    return tweetContent;
}

/**
 * Post a tweet
 * @param {string} tweetContents
 * @param {string} tweetID 
 */
const postTweet = (tweetContent, tweetID) => {
    return new Promise((resolve, _) => {
        twitter.post(
            'statuses/update',
            {
                status: tweetContent,
                attachment_url: tweetID ? `https://twitter.com/${BOT_NAME}/status/${tweetID}` : undefined,
            },
            (err, data) => {
                if (err) console.log(err);
                else {
                    console.log(`Tweet succesfully sent`);
                    resolve(data.id_str);
                }
            }
        );
    });
}

/**
 * Get seismic events of the last 5 days
 * @returns Seismic events
 */
const getEvents = async () => {
    let endtime = new Date();
    let starttime = new Date(endtime.getTime() - 86400000 * 4); // 4 days ago

    // To not tweet all events from 4 days ago, when starting the bot
    starttime = starttime < LAUNCH_TIME ? LAUNCH_TIME : starttime;

    const URL = buildUrl(FS_API_HOST, {
        path: FS_API_PATH,
        queryParams: {
            format: 'json',
            orderby: 'time',
            maxlatitude: MAXIMAL_LATITUDE,
            maxlongitude: MAXIMAL_LONGITUDE,
            minlatitude: MINIMAL_LATITUDE,
            minlongitude: MINIMAL_LONGITUDE,
            starttime: starttime.toISOString(),
            endtime: endtime.toISOString(),
        },
    });

    return (await axios.default.get(URL)).data.features;
}

/**
 * Allows to generate the twitter tags from a seismic event
 * @param {*} event Seismic event
 * @returns string tags
 */
const createTags = async (event) => {
    const URL = buildUrl(GEO_API_HOST, {
        path: GEO_API_PATH,
        queryParams: {
            format: 'json',
            lat: event.properties.latitude,
            lon: event.properties.longitude,
            zoom: 13,
        },
    });

    let res = (await axios.default.get(URL)).data.address;

    let city = res.village || res.city || res.town;
    let prefecture = res.municipality;
    let departement = res.county;

    return `${city ? `#${formatTag(city)} ` : ''}${prefecture ? `#${formatTag(prefecture)} ` : ''}${departement ? '#' + formatTag(departement) : ''}`
}

/**
 * Remove from the db all unvalidated events, older than 5 days
 */
const cleanOldNoValidatedEvents = async () => {
    let limitDate = new Date(new Date().getTime() - 86400000 * 5); // 5 days ago
    DB.removeOldEvents(limitDate);
}

const formatTag = (tag) => tag.replaceAll(" ", "").replaceAll("-", "").replaceAll("'", "");
const formatTime = (date) => date.toLocaleTimeString().replace(':', 'h').substring(0, 5);

setInterval(main, 60000); // Every minute
setInterval(cleanOldNoValidatedEvents, 86400000 / 2); // 2 times per day
