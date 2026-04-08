const apiBaseInput = document.getElementById('apiBaseUrl') as HTMLInputElement
const saveBtn = document.getElementById('save') as HTMLButtonElement
const statusEl = document.getElementById('status') as HTMLParagraphElement

chrome.storage.sync.get('apiBaseUrl', (data) => {
  apiBaseInput.value = data.apiBaseUrl || ''
})

saveBtn.addEventListener('click', () => {
  const url = apiBaseInput.value.trim()
  // Empty string = auto mode (try localhost then remote)
  chrome.storage.sync.set({ apiBaseUrl: url }, () => {
    if (statusEl) {
      statusEl.style.display = 'block'
      setTimeout(() => {
        statusEl.style.display = 'none'
      }, 2000)
    }
  })
})
