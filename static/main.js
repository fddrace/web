/* eslint-disable */

function getCaptchaWidth() {
  return Math.min(Math.floor(window.innerWidth * 0.18), 90);
}

function getCaptchaHeight() {
  return Math.floor(getCaptchaWidth() / 1.8);
}

/* eslint-enable */

let lastResize = Date.now()
let currentWidth = 0

const resizeCaptcha = () => {
  const diff = Math.floor((Date.now() - lastResize) % 86400000)
  console.log(diff)
  if (diff < 3000) {
    return
  }
  if (Math.abs(getCaptchaWidth() - currentWidth) < 10) {
    return
  }
  lastResize = Date.now()
  const iframeDom = document.querySelector('iframe')
  if (!iframeDom) {
    return
  }
  currentWidth = getCaptchaWidth()
  const chunks = iframeDom.src.split('&')
  const newSrc = chunks.slice(0, -2).join('') + `&w=${currentWidth}&h=${getCaptchaHeight()}`
  iframeDom.src = newSrc
}

window.addEventListener('resize', resizeCaptcha, true)
