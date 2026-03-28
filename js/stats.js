(function (root, factory) {
  const api = factory(
    root.SiteBlockerRules ||
      (typeof require === "function" ? require("./rule-engine.js") : null)
  )

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api
  }

  root.SiteBlockerStats = api
})(typeof globalThis !== "undefined" ? globalThis : self, function (rulesApi) {
  const STATS_STORAGE_KEY = "blockingStats"
  const DEFAULT_NAVIGATION_DEDUPE_WINDOW_MS = 2000

  function createEmptyStatistics() {
    return {
      totalBlockedNavigations: 0,
      domains: {},
    }
  }

  function normalizeCount(value) {
    if (!Number.isFinite(value)) {
      return 0
    }

    return Math.max(0, Math.floor(value))
  }

  function normalizeSite(site) {
    if (!site) {
      return ""
    }

    if (rulesApi?.sanitizeDomain) {
      return rulesApi.sanitizeDomain(site)
    }

    return String(site).trim().toLowerCase().replace(/^www\./, "")
  }

  function normalizeStatistics(rawStatistics) {
    const base = createEmptyStatistics()
    const rawDomains =
      rawStatistics &&
      typeof rawStatistics === "object" &&
      rawStatistics.domains &&
      typeof rawStatistics.domains === "object"
        ? rawStatistics.domains
        : {}

    Object.keys(rawDomains).forEach((siteKey) => {
      const normalizedSite = normalizeSite(siteKey)
      const count = normalizeCount(rawDomains[siteKey]?.count)

      if (!normalizedSite || count === 0) {
        return
      }

      const existingCount = base.domains[normalizedSite]?.count || 0
      base.domains[normalizedSite] = {
        count: existingCount + count,
      }
    })

    const derivedTotal = Object.values(base.domains).reduce(
      (sum, entry) => sum + normalizeCount(entry?.count),
      0
    )
    const preferredTotal = normalizeCount(rawStatistics?.totalBlockedNavigations)

    base.totalBlockedNavigations = Math.max(preferredTotal, derivedTotal)
    return base
  }

  function resolveTrackedSite(urlString, fallbackSite) {
    const preferredSite = normalizeSite(fallbackSite)
    if (preferredSite) {
      return preferredSite
    }

    try {
      return normalizeSite(new URL(urlString).hostname)
    } catch (error) {
      return ""
    }
  }

  function recordBlockedNavigation(statistics, urlString, fallbackSite) {
    const nextStatistics = normalizeStatistics(statistics)
    const trackedSite = resolveTrackedSite(urlString, fallbackSite)

    if (!trackedSite) {
      return nextStatistics
    }

    const currentCount = nextStatistics.domains[trackedSite]?.count || 0
    nextStatistics.domains[trackedSite] = {
      count: currentCount + 1,
    }
    nextStatistics.totalBlockedNavigations += 1

    return nextStatistics
  }

  function resetStatistics() {
    return createEmptyStatistics()
  }

  function getSortedDomainStats(statistics) {
    return Object.entries(normalizeStatistics(statistics).domains)
      .map(([site, entry]) => ({
        site,
        count: normalizeCount(entry?.count),
      }))
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count
        }

        return left.site.localeCompare(right.site)
      })
  }

  function getStatisticsSummary(statistics) {
    const normalized = normalizeStatistics(statistics)

    return {
      totalBlockedNavigations: normalized.totalBlockedNavigations,
      blockedDomainsCount: Object.keys(normalized.domains).length,
    }
  }

  function buildNavigationDedupeKey(tabId, urlString) {
    return `${String(tabId)}::${String(urlString || "")}`
  }

  function createNavigationDeduper(
    windowMs = DEFAULT_NAVIGATION_DEDUPE_WINDOW_MS
  ) {
    const recentNavigations = new Map()

    function prune(nowMs) {
      recentNavigations.forEach((timestamp, key) => {
        if (nowMs - timestamp >= windowMs) {
          recentNavigations.delete(key)
        }
      })
    }

    return {
      shouldCountNavigation(tabId, urlString, nowMs = Date.now()) {
        const key = buildNavigationDedupeKey(tabId, urlString)
        prune(nowMs)

        const previousTimestamp = recentNavigations.get(key)
        if (typeof previousTimestamp === "number" && nowMs - previousTimestamp < windowMs) {
          return false
        }

        recentNavigations.set(key, nowMs)
        return true
      },
    }
  }

  return {
    STATS_STORAGE_KEY,
    DEFAULT_NAVIGATION_DEDUPE_WINDOW_MS,
    createEmptyStatistics,
    normalizeStatistics,
    resolveTrackedSite,
    recordBlockedNavigation,
    resetStatistics,
    getSortedDomainStats,
    getStatisticsSummary,
    buildNavigationDedupeKey,
    createNavigationDeduper,
  }
})
