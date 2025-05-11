document.addEventListener("DOMContentLoaded", () => {
  const blockedUrlElement = document.getElementById("blockedUrl")
  const goBackButton = document.getElementById("goBackButton")

  const params = new URLSearchParams(window.location.search)
  const blockedUrlString = params.get("url")

  if (blockedUrlElement && blockedUrlString) {
    try {
      let decodedUrl = blockedUrlString
      try {
        decodedUrl = decodeURIComponent(blockedUrlString)
      } catch (e) {
        console.warn("Could not decode blocked URL param:", e)
      }
      blockedUrlElement.textContent = decodedUrl
    } catch (e) {
      blockedUrlElement.textContent = blockedUrlString
    }
  }

  if (goBackButton) {
    goBackButton.addEventListener("click", () => {
      const currentReferrer = document.referrer
      let normalizedReferrer = ""
      let normalizedBlockedUrl = ""

      console.log(
        "Go Back clicked. History length:",
        history.length,
        "Referrer:",
        currentReferrer
      )

      if (currentReferrer) {
        try {
          const refUrl = new URL(currentReferrer)
          normalizedReferrer = refUrl.origin + refUrl.pathname
        } catch (e) {
          console.warn("Could not parse referrer URL:", currentReferrer, e)
        }
      }
      console.log("Normalized referrer:", normalizedReferrer)

      if (blockedUrlString) {
        try {
          const blockedUrlObj = new URL(blockedUrlString)
          normalizedBlockedUrl = blockedUrlObj.origin + blockedUrlObj.pathname
        } catch (e) {
          console.warn("Could not parse blockedUrlString:", blockedUrlString, e)
        }
      }
      console.log("Normalized blocked URL:", normalizedBlockedUrl)

      const hasValidReferrer = currentReferrer && normalizedReferrer
      const isReferrerTheBlockedPage =
        hasValidReferrer &&
        normalizedBlockedUrl &&
        normalizedReferrer === normalizedBlockedUrl

      if (isReferrerTheBlockedPage) {
        console.log("Case 1: Referrer is the blocked page.")
        // Referrer IS the blocked page. We need to jump over it.
        if (history.length > 2) {
          // e.g., [GoodPage, BlockedPage(Referrer), CurrentBlocked.html]
          console.log("Attempting history.go(-2)")
          history.go(-2) // Go to GoodPage
        } else {
          // History is [BlockedPage(Referrer), CurrentBlocked.html] or just [CurrentBlocked.html]
          // Cannot go back further without hitting the blocked page again via history.
          console.log(
            "Cannot go back further, previous page is the blocked one."
          )
          alert(
            "Cannot go back further. The previous page is the one that is blocked."
          )
        }
      } else if (hasValidReferrer) {
        console.log("Case 2: Referrer exists and is NOT the blocked page.")
        // Referrer exists and is NOT the blocked page. Safe to go back to this (presumably good) referrer.
        if (history.length > 1) {
          console.log("Attempting history.back()")
          history.back()
        } else {
          console.log("No previous page in history (history.length <= 1).")
          alert("No previous page in history.")
        }
      } else {
        console.log("Case 3: Referrer is EMPTY or invalid.")
        // Referrer is EMPTY or invalid. history.back() is risky.
        // If history.back() leads to the blocked page, we'll loop once, and on the next load of blocked.html,
        // the referrer *should* be the blocked page, and Case 1 will handle it (leading to the double click).
        // Let's try to be more proactive if referrer is empty.
        if (history.length > 2) {
          // Try to jump two steps, hoping to bypass a potentially blocked intermediate page.
          // e.g. History: [GoodPage, IntermediatePage (maybe blocked), CurrentBlocked.html]
          console.log(
            "Attempting history.go(-2) due to empty/invalid referrer and history.length > 2."
          )
          history.go(-2)
        } else if (history.length > 1) {
          // Not enough history to safely jump two steps. Fallback to history.back().
          // This might lead to one loop if the immediate previous page is the blocked one.
          console.log(
            "Attempting history.back() due to empty/invalid referrer and history.length <= 2 but > 1."
          )
          history.back()
        } else {
          console.log("No previous page in history (history.length <= 1).")
          alert("No previous page in history.")
        }
      }
    })
  }

  // Existing options link logic
  const openOptionsLink = document.getElementById("openOptions")
  if (openOptionsLink) {
    openOptionsLink.addEventListener("click", (e) => {
      e.preventDefault()
      chrome.runtime.openOptionsPage()
    })
  }
})
