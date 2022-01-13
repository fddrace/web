const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('./db/survey.db')
const fs = require('fs')

const questions = JSON.parse(fs.readFileSync('survey.json', 'UTF-8'))

let dbQuery = `
CREATE TABLE IF NOT EXISTS Answers(
  username TEXT NOT NULL PRIMARY KEY,
  ip TEXT,`

questions.forEach((q, i) => {
  dbQuery += `
  question${i} TEXT,`
})
// remove last comma
dbQuery = dbQuery.slice(0, -1)
dbQuery += `
)`

db.run(dbQuery)

const insertSurvey = (username, ip, answers) => {
  const insertQuery = `INSERT INTO Answers(
    username, ip, ${answers.map((q, i) => `question${i}`).join(', ')}
  ) VALUES (?, ?${', ?'.repeat(answers.length)})
  `
  db.run(insertQuery,
    [username, ip].concat(answers),
    (err) => {
      if (err) {
        throw err
      }
    })
}

const updateSurvey = (username, answers) => {
  const updateQuery = `UPDATE Answers
    SET ${answers.map((q, i) => `question${i} = ?`).join(', ')}
    WHERE username = ?;
  `
  db.run(updateQuery,
    answers.concat([username]),
    (err) => {
      if (err) {
        throw err
      }
    })
}

const getDb = () => db

module.exports = {
  insertSurvey,
  updateSurvey,
  getDb
}
