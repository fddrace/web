const input = document.querySelector('#player')
const autocomplete = document.querySelector('.autocomplete')

const fillComplete = (players) => {
  autocomplete.innerHTML = ''
  players.forEach(player => {
    autocomplete.insertAdjacentHTML('beforeend', `<li>${player}</li>`)
  })
}

input.addEventListener('keyup', event => {
  fetch(`/api/players/${input.value}`)
    .then(data => data.json())
    .then(data => fillComplete(data))
})
