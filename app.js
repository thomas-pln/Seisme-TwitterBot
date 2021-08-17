const request = require('request');
const fs = require('fs');
require('dotenv').config();

const Twit = require('twit');

const T = new Twit({
    consumer_key: process.env.TWIT_CONSUMER_KEY,
    consumer_secret: process.env.TWIT_CONSUMER_SECRET,
    access_token: process.env.TWIT_ACCESS_TOKEN,
    access_token_secret: process.env.TWIT_ACCESS_TOKEN_SECRET
});

/**
 * Vérification de la connexion token - API
 */
T.get('account/verify_credentials', {include_entities: false,
    skip_status: true,
    include_email: false}, (err, ress)=>{
    if(err){
        console.log(err);
    }

    console.log('Connecté avec succès.')
});

/**
 * Fonction d'envoi d'un tweet
 * @param {*} content contenu du tweet (txt/emote)
 */
const postStatus = (content)=>{
    return new Promise((resolve, reject)=>{
        T.post('statuses/update', {status:content}, (err, ress)=>{
            if(err){
                reject(err)
            }else{
                resolve();
            }
        })
    }) 
};

/*
Format : YYYY-MM-DDTHH:MM:SSZ
Year - Month - Day T Hour : Minute : Second Z
*/
//const START_TIME ='2021-08-10T00:00:00Z'; 
//const END_TIME = '2021-08-13T23:59:59.99Z';

var date = new Date().toISOString().split('T')[0];

const MAXIMAL_LATITUDE ='51.09';
const MINIMAL_LONGITUDE = '-5.57';
const MAXIMAL_LONGITUDE = '8.23';
const MINIMAL_LATITUDE = '42.34';

const URL = `https://api.franceseisme.fr/fdsnws/event/1/query?endtime=${date}T23:59:59.999999Z&format=json&maxlatitude=${MAXIMAL_LATITUDE}&maxlongitude=${MAXIMAL_LONGITUDE}&minlatitude=${MINIMAL_LATITUDE}&minlongitude=${MINIMAL_LONGITUDE}&orderby=time&starttime=${date}T00:00:00Z`;

/**
 * Requête et récupère la liste actualisée des événements de la journée courante
 * @returns
 */
const getEvents = () => {
    return new Promise((resolve, reject) =>{
        request.get(URL, {}, (err, res, body)=>{
            if (err) {
                reject(err);
            }else{
                resolve(body);
            }
        });
    });
}

/**
 * Tweet tous les nouveaux évennements ne se trouvant pas dans ./data/data.json 
 * ainsi que ceux qui n'étaient pas validés lors de la vérification précédente.
 * Ecrase les anciennes données avec les nouvelles.
 */
 async function sismicEvents(msg){
    var oldData = await new Promise((resolve, reject)=>{
      fs.readFile('./data/data.json', 'utf-8',(err, data)=>{
        if(err){
          reject(err);
        }else{
          resolve(data)
        }
      });
    })
    newData = await getEvents();
    newData = JSON.parse(newData);
    oldData = JSON.parse(oldData);  
  
  
    for await(var nd of newData['features']){
      var isIn = false;
      //Récupération du pays à partir des coordonées pour vérifier que l'événement s'est bien produit en France
      const URL = `http://api.geonames.org/countryCodeJSON?lat=${nd['properties']['latitude']}&lng=${nd['properties']['longitude']}&username=${process.env.USERNAME}`;
      var country = await new Promise((resolve, reject) =>{
        request.get(URL, {}, (error, res, body)=>{
            if (error) {
                reject(error);
            }else{
                resolve(body);
            }
        });
      });
      country = JSON.parse(country);
  
      if(country['countryCode']=== 'FR'){
        var dateEvent = new Date(`${nd['properties']['time']}`);
        for(var od of oldData['features']){
            if(nd['id'] === od['id'] && nd['properties']['automatic'] != od['properties']['automatic']){
              //Evenement validé
              isIn = true;
              await postStatus(`💥 ${nd['properties']['description']['fr']}\n⏰ ${dateEvent.getDate()}-${dateEvent.getMonth()}-${dateEvent.getFullYear()} à ${dateEvent.getHours()}:${dateEvent.getMinutes()}\n🧭 Latitude ${nd['geometry']['coordinates'][1]} Longitude ${nd['geometry']['coordinates'][0]}\nVérifié: ✅\n💻 ${nd['properties']['url']['fr']}\n_______`);
              break;  
            }else if(nd['id'] === od['id'] && nd['properties']['automatic'] == od['properties']['automatic']){
              //Evenement déjà affiché
              isIn = true;
              break;
            }
          }
          if(!isIn){
            if(nd['properties']['automatic']){
              await postStatus(`💥 ${nd['properties']['description']['fr']}\n⏰ ${dateEvent.getDate()}-${dateEvent.getMonth()}-${dateEvent.getFullYear()} à ${dateEvent.getHours()}:${dateEvent.getMinutes()}\n🧭 Latitude ${nd['geometry']['coordinates'][1]} Longitude ${nd['geometry']['coordinates'][0]}\nVérifié: ⌛ (en attente de validation) \n💻 ${nd['properties']['url']['fr']}\n_______`);
            }else{
                await postStatus(`💥 ${nd['properties']['description']['fr']}\n⏰ ${dateEvent.getDate()}-${dateEvent.getMonth()}-${dateEvent.getFullYear()} à ${dateEvent.getHours()}:${dateEvent.getMinutes()}\n🧭 Latitude ${nd['geometry']['coordinates'][1]} Longitude ${nd['geometry']['coordinates'][0]}\nVérifié: ✅\n💻 ${nd['properties']['url']['fr']}\n_______`);
            }
          }
      }
    }
    var updateFile = JSON.stringify(newData);
    await fs.writeFile('./data/data.json', updateFile, 'utf8', (err)=>{
      if(err){
        console.log(`Error writing file: ${err}`);
      }
    });
  }

sismicEvents();