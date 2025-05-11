document.addEventListener("DOMContentLoaded", () => {
  const openOptionsLink = document.getElementById("openOptions")
  if (openOptionsLink) {
    openOptionsLink.addEventListener("click", (e) => {
      e.preventDefault()
      chrome.runtime.openOptionsPage()
    })
  }
})
