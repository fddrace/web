const express = require('express')
const session = require('express-session')
const redis = require('redis')
const app = express()
const fs = require('fs')
const dotenv = require('dotenv')
const redisStore = require('connect-redis')(session)
const redisClient = redis.createClient()
dotenv.config()

const { sendMail } = require('./src/mail')
const { loginAccount } = require('./src/account')

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

app.use(session({
  secret: process.env.SESSION_SECRET,
  store: new redisStore({ host: 'localhost', port: 6379, client: redisClient, ttl: 260 }),
  saveUninitialized: true,
  resave: true
}))

app.set('view engine', 'ejs')

app.get('/', (req, res) => {
  res.render('index', { token: 'secure-token' })
})

app.get('/login', (req, res) => {
  res.render('login')
})

app.get('/account', (req, res) => {
  if (req.session.data) {
    res.render('account', { data: req.session.data })
  } else {
    res.redirect(301, '/login')
  }
})

app.get('/reset', (req, res) => {
  res.render('reset')
})

app.post('/login', async (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' })
  const loggedIn = await loginAccount(request.body.username, request.body.password)
  if (loggedIn) {
    response.end('<html>Sucessfully logged in. <a href="login">back</a></html>')
    request.session.data = loggedIn
  } else {
    response.end('<html>Failed to login. <a href="login">back</a></html>')
  }
})

app.post('/reset', (request, response) => {
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
  console.log(`App running on http://localhost:${port}.`)
})
