(function (root, factory) {
  const api = factory(
    root.SiteBlockerRules ||
      (typeof require === "function" ? require("./rule-engine.js") : null)
  )

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api
  }

  root.SiteBlockerBlockedPage = api
})(typeof globalThis !== "undefined" ? globalThis : self, function (rulesApi) {
  function getTypeLabel(type) {
    if (rulesApi?.getRuleTypeLabel) {
      return rulesApi.getRuleTypeLabel(type)
    }

    return type === "timed" ? "Scheduled" : "Permanent"
  }

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
    const typeLabel = getTypeLabel(rule.type)

    if (rule.subpageMode === "whitelist") {
      return `${typeLabel} rule for ${rule.site}. The site is blocked by default, but listed paths stay open.`
    }

    if (rule.subpageMode === "blacklist") {
      return `${typeLabel} rule for ${rule.site}. The site stays open by default, but listed paths are blocked.`
    }

    return `${typeLabel} rule for ${rule.site}. The whole domain is blocked.`
  }

  function formatAvailability(nextAllowed, now = new Date()) {
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

  return {
    readBlockedUrl,
    buildStaticSummary,
    buildActiveRuleSummary,
    formatAvailability,
  }
})
