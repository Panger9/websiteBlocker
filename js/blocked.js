document.addEventListener("DOMContentLoaded", async () => {
  const {
    normalizeRules,
    getActiveBlockingRuleForUrl,
    getRuleTypeLabel,
    getSubpageModeLabel,
    getNextAllowedDate,
  } = SiteBlockerRules

  const searchParams = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  const blockedUrlElement = document.getElementById("blockedUrl")
  const ruleSummaryElement = document.getElementById("ruleSummary")
  const ruleScheduleElement = document.getElementById("ruleSchedule")
  const goBackButton = document.getElementById("goBackButton")
  const openOptionsLink = document.getElementById("openOptions")

  const params = hashParams.toString() ? hashParams : searchParams
  const blockedUrl = readBlockedUrl(params) || document.referrer || ""

  blockedUrlElement.textContent = blockedUrl || "Blocked destination unavailable for this redirect."
  ruleSummaryElement.textContent = buildStaticSummary(params)

  if (blockedUrl) {
    try {
      const result = await chrome.storage.local.get(["blockedRules"])
      const rules = normalizeRules(result.blockedRules || [])
      const match = getActiveBlockingRuleForUrl(blockedUrl, rules)

      if (match.shouldBlock) {
        const nextAllowed = getNextAllowedDate(match.matchingRule)
        ruleSummaryElement.textContent = `${getRuleTypeLabel(match.matchingRule.type)} rule for ${match.matchingRule.site} with ${getSubpageModeLabel(match.matchingRule.subpageMode).toLowerCase()} mode.`
        ruleScheduleElement.textContent = nextAllowed
          ? `Available again after ${nextAllowed.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}.`
          : "This rule is active until you change it."
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

    chrome.runtime.openOptionsPage()
  })

  openOptionsLink.addEventListener("click", (event) => {
    event.preventDefault()
    chrome.runtime.openOptionsPage()
  })

  function readBlockedUrl(sourceParams) {
    const blockedValue = sourceParams.get("blocked") || sourceParams.get("url")
    if (!blockedValue) {
      return ""
    }

    try {
      return decodeURIComponent(blockedValue)
    } catch (error) {
      return blockedValue
    }
  }

  function buildStaticSummary(sourceParams) {
    const site = sourceParams.get("site")
    const type = sourceParams.get("type")
    const mode = sourceParams.get("mode")

    if (!site) {
      return "This page was blocked by your current SiteBlocker rule."
    }

    return `${getRuleTypeLabel(type)} rule for ${site} with ${getSubpageModeLabel(mode).toLowerCase()} mode.`
  }
})
