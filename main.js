const express = require('express')
const session = require('express-session')
const redis = require('redis')
const { v4: uuidv4 } = require('uuid')
const app = express()
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

const captchaData = {}

app.use(session({
  secret: process.env.SESSION_SECRET,
  store: new redisStore({ host: 'localhost', port: 6379, client: redisClient, ttl: 260 }),
  saveUninitialized: true,
  resave: true
}))

app.set('view engine', 'ejs')

app.get('/', (req, res) => {
  res.render('index', {
    token: process.env.CAPTCHA_TOKEN,
    hostname: process.env.HOSTNAME,
    captchaBackend: process.env.CAPTCHA_BACKEND
  })
})

app.get('/login', (req, res) => {
  const token = uuidv4()
  res.render('login', {
    token: token,
    hostname: process.env.HOSTNAME,
    captchaBackend: process.env.CAPTCHA_BACKEND
  })
})

app.get('/account', (req, res) => {
  if (req.session.data) {
    res.render('account', { data: req.session.data })
  } else {
    res.redirect('/login')
  }
})

app.get('/reset', (req, res) => {
  res.render('reset')
})

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.log(err)
    } else {
      res.redirect('/')
    }
  })
})

app.post('/login', async (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' })
  if (captchaData[request.body.token] !== 1) {
    response.end('<html>Failed to login. Are you a robot?<a href="login">back</a></html>')
    return
  }
  // tokens are one use only
  delete captchaData[request.body.token]
  const loggedIn = await loginAccount(request.body.username, request.body.password)
  if (loggedIn) {
    request.session.data = loggedIn
    response.end('<html>Sucessfully logged in. <a href="account">ok</a></html>')
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
  const reqHost = `${request.protocol}://${request.header('Host')}`
  if (reqHost !== process.env.CAPTCHA_BACKEND) {
    console.log(`[captcha] blocked post from invalid host='${reqHost}' expected='${process.env.CAPTCHA_BACKEND}'`)
    response.end('ERROR')
    return
  }
  const score = request.body.score
  if (score === 1) {
    // do not save robot scores to save memory
    captchaData[request.body.token] = score
    console.log(`[captcha] result=hooman ip=${request.ip}`)
  } else {
    console.log(`[captcha] result=robot ip=${request.ip}`)
  }
  response.end('OK')
})

app.listen(port, () => {
  console.log(`App running on http://localhost:${port}.`)
})
