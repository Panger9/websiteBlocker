document.addEventListener("DOMContentLoaded", async () => {
  const {
    normalizeRules,
    getActiveBlockingRuleForUrl,
    getRuleTypeLabel,
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

    return buildActiveRuleSummary({ site, type, subpageMode: mode })
  }

  function buildActiveRuleSummary(rule) {
    const typeLabel = getRuleTypeLabel(rule.type)

    if (rule.subpageMode === "whitelist") {
      return `${typeLabel} rule for ${rule.site}. The site is blocked by default, but listed paths stay open.`
    }

    if (rule.subpageMode === "blacklist") {
      return `${typeLabel} rule for ${rule.site}. The site stays open by default, but listed paths are blocked.`
    }

    return `${typeLabel} rule for ${rule.site}. The whole domain is blocked.`
  }

  function formatAvailability(nextAllowed) {
    const now = new Date()
    const sameDay = now.toDateString() === nextAllowed.toDateString()

    if (sameDay) {
      return `today at ${nextAllowed.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    }

    return `on ${nextAllowed.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })} at ${nextAllowed.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`
  }
})
