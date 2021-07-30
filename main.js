const express = require('express')
const session = require('express-session')
const redis = require('redis')
const { v4: uuidv4 } = require('uuid')
const app = express()
const dotenv = require('dotenv')
const redisStore = require('connect-redis')(session)
const redisClient = redis.createClient()
dotenv.config()

const { sendMailPassword, sendMailVerify } = require('./src/mail')
const { loginAccount, getAccsByEmail } = require('./src/account')
const { execCmd } = require('./src/api')

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

const isCaptcha = process.env.CAPTCHA_BACKEND && process.env.CAPTCHA_BACKEND !== ''
const captchaData = {}

app.use(session({
  secret: process.env.SESSION_SECRET,
  /* eslint-disable new-cap */
  store: new redisStore({ host: 'localhost', port: 6379, client: redisClient, ttl: 260 }),
  /* eslint-enable new-cap */
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
    isCaptcha: isCaptcha,
    hostname: process.env.HOSTNAME,
    captchaBackend: process.env.CAPTCHA_BACKEND
  })
})

app.get('/account', (req, res) => {
  if (req.session.data) {
    res.render('account', { data: req.session.data, messageGreen: false })
  } else {
    res.redirect('/login')
  }
})

app.post('/account', (req, res) => {
  if (!req.session.data || !req.session.data.username || req.session.data.username === '') {
    res.redirect('/login')
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/html' })
  const token = uuidv4()
  if (!req.body.email || req.body.email === '') {
    res.end('Invalid mail.')
    return
  }
  const username = req.session.data.username
  const email = req.body.email.trim().toLowerCase()
  const today = new Date()
  const expireDate = new Date(today.getFullYear(), today.getMonth(), today.getDay() + 3).toISOString().split('T')[0]
  redisClient.set(token, JSON.stringify({ username: username, email: email, expire: expireDate }), (err, reply) => {
    if (err) throw err

    console.log(`[email update] email='${email}' username='${username}' redis response: ${reply}`)
  })
  sendMailVerify(email, token)
  res.end('Check your mail.')
})

app.get('/verify-email', async (req, res) => {
  const { token } = req.query
  redisClient.get(token, async (err, reply) => {
    if (err || reply === null) {
      res.end('Invalid token.')
      return
    }

    console.log(reply)
    const data = JSON.parse(reply)
    // TODO: check expire date and delete token
    const username = data.username
    const email = data.email
    if (!username || !email) {
      res.end('Something went wrong.')
      return
    }
    const loggedIn = await loginAccount(username, null)
    if (!loggedIn) {
      res.end('Something went horribly wrong')
      return
    }
    execCmd('econ', `acc_edit ${username} contact "${email}"`)
    req.session.data = loggedIn
    req.session.data.email = email
    res.render('account', { messageGreen: 'E-Mail verified', data: req.session.data })
  })
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

app.post('/login', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  if (isCaptcha) {
    if (captchaData[req.body.token] !== 1) {
      res.end('<html>Failed to login. Are you a robot?<a href="login">back</a></html>')
      return
    }
  }
  // tokens are one use only
  delete captchaData[req.body.token]
  const loggedIn = await loginAccount(req.body.username, req.body.password)
  if (loggedIn) {
    req.session.data = loggedIn
    res.end('<html>Sucessfully logged in. <a href="account">ok</a></html>')
  } else {
    res.end('<html>Failed to login. <a href="login">back</a></html>')
  }
})

app.post('/new-password', (req, res) => {
  const { password, password2, token } = req.body
  if (password !== password2) {
    res.end('Passwords do not match')
    return
  }
  if (typeof token !== 'string') {
    res.end('Invalid token.')
    return
  }
  console.log(`redisClient get token='${token}'`)
  redisClient.get(token, (err, reply) => {
    if (err || reply === null) {
      res.end('Invalid token.')
      return
    }

    console.log(reply)
    const data = JSON.parse(reply)
    console.log(data)
    // TODO: check data.expire
    execCmd('econ', `acc_edit ${data.username} password "${password}"`)
    res.end(JSON.stringify(data))
  })
})

app.get('/new-password', (req, res) => {
  const { token } = req.query
  redisClient.get(token, (err, reply) => {
    if (err || reply === null) {
      res.end('Invalid token.')
      return
    }

    console.log(reply)
    res.render('new-password', { username: JSON.parse(reply).username, token: token })
  })
})

app.post('/reset', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  const token = uuidv4()
  if (!req.body.email || req.body.email === '') {
    res.end('Invalid mail.')
    return
  }
  const email = req.body.email.trim().toLowerCase()
  const acc = getAccsByEmail(email)[0]
  if (!acc) {
    // keep same message here as in happy path
    // to not leak emails
    res.end('Check your mail.')
    return
  }
  const today = new Date()
  const expireDate = new Date(today.getFullYear(), today.getMonth(), today.getDay() + 3).toISOString().split('T')[0]
  const username = acc.username
  redisClient.set(token, JSON.stringify({ username: username, expire: expireDate }), (err, reply) => {
    if (err) throw err

    console.log(`[password-reset] email='${email}' username='${username}' redis response: ${reply}`)
  })
  sendMailPassword(email, token)
  res.end('Check your mail.')
})

app.use(express.json())

app.set('trust proxy', true)

app.post('/', (req, res) => {
  const reqHost = `${req.protocol}://${req.header('Host')}`
  const reqAddr = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  const isOwnAddr = reqAddr === process.env.IP_ADDR
  if (reqHost !== process.env.CAPTCHA_BACKEND && !isOwnAddr) {
    console.log(`[captcha] blocked post from invalid host='${reqHost}' addr='${reqAddr}' expected='${process.env.CAPTCHA_BACKEND}'`)
    res.end('ERROR')
    return
  }
  const score = req.body.score
  if (score === 1) {
    // do not save robot scores to save memory
    captchaData[req.body.token] = score
    console.log(`[captcha] result=hooman ip=${req.ip}`)
  } else {
    console.log(`[captcha] result=robot ip=${req.ip}`)
  }
  res.end('OK')
})

app.use(express.static('static'))

app.listen(port, () => {
  console.log(`App running on http://localhost:${port}.`)
})
