const { Database } = require('sqlite3')

const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('./db/survey.db')

db.run(`
CREATE TABLE IF NOT EXISTS Answers(
  username TEXT,
  question1 TEXT,
  question2 TEXT
)
`)

const insertSurvey = (username, answers) => {
  db.run(
    `INSERT INTO Answers(
      username, question1, question2
    ) VALUES (?, ?, ?)
    `,
    [
      username,
      answers[0],
      answers[1]
    ],
    (err) => {
      if (err) {
        throw err
      }
    })
}

const getDb = () => db

const hasVoted = async (username) => {
  const res = await db.get('SELECT * FROM Answers WHERE username = ?', username)
  res
  return res.length !== 0
}

module.exports = {
  insertSurvey,
  hasVoted,
  getDb
}
