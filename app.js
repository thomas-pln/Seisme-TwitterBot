const Twitter = require('twit');
const axios = require('axios');
var buildUrl = require('build-url');
require('dotenv').config();

const MAXIMAL_LATITUDE = '51.09';
const MAXIMAL_LONGITUDE = '9.80';
const MINIMAL_LATITUDE = '41.34';
const MINIMAL_LONGITUDE = '-5.57';

const FS_API_HOST = 'https://api.franceseisme.fr/';
const FS_API_PATH = 'fdsnws/event/1/query';

const GEO_API_HOST = 'http://nominatim.openstreetmap.org';
const GEO_API_PATH = 'reverse';

const twitter = new Twitter({
    consumer_key: process.env.TWIT_CONSUMER_KEY,
    consumer_secret: process.env.TWIT_CONSUMER_SECRET,
    access_token: process.env.TWIT_ACCESS_TOKEN,
    access_token_secret: process.env.TWIT_ACCESS_TOKEN_SECRET
});

/**
 * Vérification de la connexion token - API
 */
 twitter.get('account/verify_credentials', {
    include_entities: false,
    skip_status: true,
    include_email: false
}, (err, _) => {
    if (err) console.log(err);
    console.log(`Connecté avec succès. -- ${new Date().toString()}`)
});

/**
 * Get seismic events of the last minute and tweet it
 */
const main = async () => {
    let events = await getEvents();

    for (let event of events) {
        let tweetContent = '';
        let eventDate = new Date(event.properties.time);

        tweetContent += `💥 ${event.properties.description.fr}\n`;
        tweetContent += `⏰ ${eventDate.toLocaleDateString()} à ${formatTime(eventDate)}\n`;
        tweetContent += `🧭 Latitude ${event.geometry.coordinates[1].toFixed(2)} Longitude ${event.geometry.coordinates[0].toFixed(2)}\n`;
        tweetContent += `💻 ${event.properties.url.fr}\n`;
        tweetContent += '_______\n'
        tweetContent += await getTags(event);

        twitter.post(
            'statuses/update',
            { status: tweetContent },
            (err, _) => {
                if (err) console.log(err);
                else console.log(`Tweet succesfully sent. Event id: ${event.id}`);
            }
        );
    }
}

/**
 * Get seismic events of the last minute, from France Seisme API
 * @returns Seismic events
 */
const getEvents = async () => {
    let starttime = new Date();
    starttime.setMinutes((new Date()).getMinutes() - 1);
    starttime.setSeconds(0);
    starttime.setMilliseconds(0);

    let endtime = new Date();
    endtime.setSeconds(0);
    endtime.setMilliseconds(0);

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
const getTags = async (event) => {
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

    return `${city ? '#' + formatTag(city) + ' ' : ''}${prefecture ? '#' + formatTag(prefecture) + ' ' : ''}${departement ? '#' + formatTag(departement) : ''}`
}

const formatTag = (tag) => tag.replaceAll(" ", "").replaceAll("-", "").replaceAll("'", "");
const formatTime = (date) => date.toLocaleTimeString().replace(':', 'h').substring(0,5);

setInterval(main(), 60000);
