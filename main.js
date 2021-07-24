const express = require('express')
const app = express()
const fs = require('fs')
const dotenv = require('dotenv')
dotenv.config()

const { sendMail } = require('./src/account')

const port = 5690

// Add headers
// https://stackoverflow.com/a/18311469
app.use(function (req, res, next) {
  // TODO: make this more dynamic and decide on a front end port (9090 for now)
  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:9090')

  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')

  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')

  // Set to true if you need the website to include cookies in the requests sent
  // res.setHeader('Access-Control-Allow-Credentials', true);

  // Pass to next layer of middleware
  next()
})

app.use(
  express.urlencoded({
    extended: true
  })
)

app.get('/', (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' })
  fs.readFile('./html/index.html', 'utf8', (err, data) => {
    if (err) {
      response.end('error')
      return console.log(err)
    }
    response.end(
      data
        .replaceAll('placeholder-token', 'secure-token')
    )
  })
})

app.get('/account', (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' })
  fs.readFile('./html/account.html', 'utf8', (err, data) => {
    if (err) {
      response.end('error')
      return console.log(err)
    }
    response.end(data)
  })
})

app.post('/account', (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' })
  response.end('<html>OK</html>')
  sendMail(request.body.email)
})

app.use(express.json())

app.set('trust proxy', true)

app.post('/', (request, response) => {
  if (request.body.score === 1) {
    console.log(`[hooman] ip=${request.ip}`)
  } else {
    console.log(`[robot] ip=${request.ip}`)
  }
  response.end('OK')
})

app.listen(port, () => {
  console.log(`App running on port ${port}.`)
})
