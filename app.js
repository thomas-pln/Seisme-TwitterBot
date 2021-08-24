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
const MAXIMAL_LONGITUDE = '9.80';
const MINIMAL_LATITUDE = '41.341';

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
      //Récupération des données géographique à partir des coordonées
      const URLGeo = `http://nominatim.openstreetmap.org/reverse?format=json&lat=${nd['properties']['latitude']}&lon=${nd['properties']['longitude']}&zoom=13`;
      var geo = await new Promise((resolve, reject) =>{
        request.get(URLGeo, {}, (error, res, body)=>{
            if (error) {
                reject(error);
            }else{
                resolve(body);
            }
        });
      });
      geo = JSON.parse(geo);
      geo = geo['address'];
  
      if(geo.country_code === 'fr' && nd.type != "quarry blast"){

        var ville = undefined;
        //Le point peut tomber sur une ville définit comme 'village' ou 'town' par OSM
        if(Object.keys(geo).includes('town')){
          ville = geo.town.replaceAll(" ", "").replaceAll("-","").replaceAll("'","");;
        }else if(Object.keys(geo).includes('village')){
            ville = geo.village.replaceAll(" ", "").replaceAll("-","").replaceAll("'","");;
        }
        var prefecture = geo.municipality.replaceAll(" ", "").replaceAll("-","").replaceAll("'","");;
        var departement = geo.county.replaceAll(" ", "").replaceAll("-","").replaceAll("'","");;

        var dateEvent = new Date(`${nd['properties']['time']}`);
        for(var od of oldData['features']){
            if(nd['id'] === od['id'] && nd['properties']['automatic'] != od['properties']['automatic']){
              //Evenement validé
              isIn = true;
              await postStatus(`💥 ${nd['properties']['description']['fr']}\n⏰ ${dateEvent.getDate()}-${dateEvent.getMonth()}-${dateEvent.getFullYear()} à ${dateEvent.getHours()+2}:${dateEvent.getMinutes()}\n🧭 Latitude ${nd['geometry']['coordinates'][1].toFixed(2)} Longitude ${nd['geometry']['coordinates'][0].toFixed(2)}\nVérifié: ✅\n💻 ${nd['properties']['url']['fr']}\n_______\n#${ville} #${prefecture} #${departement}`);
              break;  
            }else if(nd['id'] === od['id'] && nd['properties']['automatic'] == od['properties']['automatic']){
              //Evenement déjà affiché
              isIn = true;
              break;
            }
          }
          if(!isIn){
            //Nouvel évennement
            if(nd['properties']['automatic']){
              //Nouvel évennement non vérifié
              await postStatus(`💥 ${nd['properties']['description']['fr']}\n⏰ ${dateEvent.getDate()}-${dateEvent.getMonth()}-${dateEvent.getFullYear()} à ${dateEvent.getHours()+2}:${dateEvent.getMinutes()}\n🧭 Latitude ${nd['geometry']['coordinates'][1].toFixed(2)} Longitude ${nd['geometry']['coordinates'][0].toFixed(2)}\nVérifié: ⌛ (en attente de validation) \n💻 ${nd['properties']['url']['fr']}\n_______`);
            }else{
              //Nouvel évennement vérifié
                await postStatus(`💥 ${nd['properties']['description']['fr']}\n⏰ ${dateEvent.getDate()}-${dateEvent.getMonth()}-${dateEvent.getFullYear()} à ${dateEvent.getHours()+2}:${dateEvent.getMinutes()}\n🧭 Latitude ${nd['geometry']['coordinates'][1].toFixed(2)} Longitude ${nd['geometry']['coordinates'][0].toFixed(2)}\nVérifié: ✅\n💻 ${nd['properties']['url']['fr']}\n_______\n#${ville} #${prefecture} #${departement}`);
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