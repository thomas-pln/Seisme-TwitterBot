const sqlite3 = require('sqlite3');
require('dotenv').config();

class SeismicDB {
    #DB;

    constructor() {
        this.#DB = new sqlite3.Database(process.env.DB_NAME, sqlite3.OPEN_READWRITE, (err) => {
            if (err && err.code == "SQLITE_CANTOPEN") this.#createDatabase();
        });
    }

    #createDatabase() {
        this.#DB = new sqlite3.Database(process.env.DB_NAME, (err) => {
            if (err) {
                console.log(err);
                exit(1);
            }

            this.#DB.run(`
            CREATE TABLE events (
                id TEXT PRIMARY KEY NOT NULL,
                tweetID TEXT NOT NULL,
                date REAL NOT NULL
            );
            `);
        });
    }

    /**
     * Allows to get an event from its id
     * @param {string} id Event id
     * @returns events
     */
    getEvent(id) {
        return new Promise((resolve, _) => {
            this.#DB.get(`
                SELECT * 
                FROM events
                WHERE id = ?
            `, id, (err, result) => {
                if (err) console.log(err);
                else {
                    resolve(result)
                }
            }
            );
        });
    }

    /**
     * Allows to remvove events older then the limit date in paramter
     * @param {number} limitDate 
     */
    removeOldEvents(limitDate) {
        console.log("DELETE old Events");
        this.#DB.run(`
            DELETE FROM events
            WHERE date < ?
        `, limitDate);
    }

    /**
     * Allows to insert an event in DB
     * @param {string} id 
     * @param {string} tweetID 
     * @param {number} date 
     */
    insertEvent(id, tweetID, date) {
        console.log(`INSERT: eventId=${id} tweetId=${tweetID}`);
        this.#DB.run(`
            INSERT INTO events (id, tweetID, date)
            VALUES (?, ?, ?)
        `, [id, tweetID, date]);
    }

    /**
     * Allows to remove an event of the db from its id
     * @param {string} id
     */
    removeEvent(id) {
        console.log(`DELETE: ${id}`);
        this.#DB.run(`
            DELETE FROM events
            WHERE id = ?
        `, id);
    }
}

module.exports = SeismicDB;