document.addEventListener("DOMContentLoaded", async () => {
  const {
    RULES_STORAGE_KEY,
    normalizeRules,
    getActiveBlockingRuleForUrl,
    getNextAllowedDate,
  } = SiteBlockerRules
  const {
    readBlockedUrl,
    buildStaticSummary,
    buildActiveRuleSummary,
    formatAvailability,
  } = SiteBlockerBlockedPage

  const searchParams = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  const blockedUrlElement = document.getElementById("blockedUrl")
  const ruleSummaryElement = document.getElementById("ruleSummary")
  const ruleScheduleElement = document.getElementById("ruleSchedule")
  const goBackButton = document.getElementById("goBackButton")
  const openOptionsLink = document.getElementById("openOptions")
  const canAccessExtensionStorage =
    typeof chrome !== "undefined" && Boolean(chrome.storage?.local)
  const canOpenOptionsPage =
    typeof chrome !== "undefined" && Boolean(chrome.runtime?.openOptionsPage)

  const params = hashParams.toString() ? hashParams : searchParams
  const blockedUrl = readBlockedUrl(params) || document.referrer || ""

  blockedUrlElement.textContent = blockedUrl || "Blocked destination unavailable for this redirect."
  ruleSummaryElement.textContent = buildStaticSummary(params)

  if (blockedUrl && canAccessExtensionStorage) {
    try {
      const result = await chrome.storage.local.get([RULES_STORAGE_KEY])
      const rules = normalizeRules(result[RULES_STORAGE_KEY] || [])
      const match = getActiveBlockingRuleForUrl(blockedUrl, rules)

      if (match.shouldBlock) {
        const nextAllowed = getNextAllowedDate(match.matchingRule)
        ruleSummaryElement.textContent = buildActiveRuleSummary(match.matchingRule)
        ruleScheduleElement.textContent = nextAllowed
          ? `This page becomes available again ${formatAvailability(nextAllowed)}.`
          : "This rule stays active until you change or delete it."
      }
    } catch (error) {
      console.error("Failed to enrich blocked page details.", error)
    }
  }

  goBackButton.addEventListener("click", () => {
    if (history.length > 1) {
      history.back()
      return
    }

    openOptionsPage()
  })

  openOptionsLink.addEventListener("click", (event) => {
    event.preventDefault()
    openOptionsPage()
  })

  function openOptionsPage() {
    if (canOpenOptionsPage) {
      chrome.runtime.openOptionsPage()
      return
    }

    window.location.href = "../html/options.html"
  }

})
