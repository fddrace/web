/* global fetch:false */

const fillComplete = (players, completeList, input, completeIdentifier) => {
  if (!completeList) {
    return
  }
  completeList.innerHTML = ''
  players.forEach(player => {
    completeList.insertAdjacentHTML('beforeend', `<li class="complete-entry ${completeIdentifier}">${player}</li>`)
  })
  document.querySelectorAll(`li.${completeIdentifier}`).forEach(li => {
    li.addEventListener('click', event => {
      input.value = li.innerText
      completeList.innerHTML = ''
    })
  })
}

document.querySelectorAll('input.complete-players').forEach(input => {
  input.addEventListener('keyup', event => {
    const autoClasses = Array.from(event.target.classList).filter(className => className.startsWith('complete-') && className !== 'complete-players')
    if (autoClasses.length !== 1) {
      return
    }
    const completeList = document.querySelector(`ul.${autoClasses[0]}`)
    if ((!input.value || input.value === '') && completeList) {
      completeList.innerHTML = ''
    }
    fetch(`/api/players/${encodeURIComponent(input.value)}`)
      .then(data => data.json())
      .then(data => fillComplete(data, completeList, input, autoClasses[0]))
  })
})
