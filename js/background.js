if (typeof importScripts === "function") {
  importScripts("rule-engine.js", "stats.js")
}

(function (root, factory) {
  const api = factory(root.SiteBlockerRules, root.SiteBlockerStats, root.chrome)

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api
  }

  root.SiteBlockerBackground = api

  if (api.canInitialize) {
    api.initialize()
  }
})(typeof globalThis !== "undefined" ? globalThis : self, function (
  rulesApi,
  statsApi,
  chromeApi
) {
  const DEBUG = false

  function createServiceWorkerController({
    chromeApi: runtimeChrome,
    rulesApi: runtimeRules,
    statsApi: runtimeStats,
  }) {
    const {
      RULES_STORAGE_KEY,
      normalizeRules,
      buildDnrRules,
      getActiveBlockingRuleForUrl,
      buildBlockedPageUrl,
    } = runtimeRules
    const { STATS_STORAGE_KEY, normalizeStatistics, recordBlockedNavigation } =
      runtimeStats

    let currentRules = []
    const navigationDeduper = runtimeStats.createNavigationDeduper()

    function debugLog(...args) {
      if (DEBUG) {
        console.log("[SiteBlocker]", ...args)
      }
    }

    async function loadRulesFromStorage() {
      try {
        const result = await runtimeChrome.storage.local.get([RULES_STORAGE_KEY])
        currentRules = normalizeRules(result[RULES_STORAGE_KEY] || [])
        await updateDeclarativeNetRequestRules()
      } catch (error) {
        console.error("Failed to load rules from storage.", error)
      }
    }

    async function updateDeclarativeNetRequestRules() {
      const nextRules = buildDnrRules(currentRules)

      try {
        const existingRules = await runtimeChrome.declarativeNetRequest.getDynamicRules()
        const removeRuleIds = existingRules.map((rule) => rule.id)

        const serialize = (rules) =>
          JSON.stringify(
            rules.map((rule) => ({
              priority: rule.priority,
              action: rule.action,
              condition: rule.condition,
            }))
          )

        if (
          existingRules.length === nextRules.length &&
          serialize(existingRules) === serialize(nextRules)
        ) {
          return
        }

        await runtimeChrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds,
          addRules: nextRules,
        })
      } catch (error) {
        console.error("Failed to update dynamic rules.", error)
        debugLog("Current rules", currentRules)
        debugLog("Generated DNR rules", nextRules)
      }
    }

    async function recordBlockedNavigationAttempt(urlString, ruleSite) {
      try {
        const result = await runtimeChrome.storage.local.get([STATS_STORAGE_KEY])
        const currentStatistics = normalizeStatistics(result[STATS_STORAGE_KEY])
        const nextStatistics = recordBlockedNavigation(
          currentStatistics,
          urlString,
          ruleSite
        )

        await runtimeChrome.storage.local.set({
          [STATS_STORAGE_KEY]: nextStatistics,
        })
      } catch (error) {
        console.error("Failed to persist blocked navigation statistics.", error)
      }
    }

    async function redirectTabToBlockedPage(tabId, blockedUrl, rule) {
      try {
        const pagePath = buildBlockedPageUrl(rule, blockedUrl).slice(1)
        await runtimeChrome.tabs.update(tabId, {
          url: runtimeChrome.runtime.getURL(pagePath),
        })
      } catch (error) {
        console.error("Failed to redirect blocked tab.", error)
      }
    }

    async function checkAndBlockIfNecessary(tabId, urlString, nowMs = Date.now()) {
      if (!urlString) {
        return false
      }

      const activeRuleInfo = getActiveBlockingRuleForUrl(urlString, currentRules)
      if (!activeRuleInfo.shouldBlock) {
        return false
      }

      if (navigationDeduper.shouldCountNavigation(tabId, urlString, nowMs)) {
        await recordBlockedNavigationAttempt(
          urlString,
          activeRuleInfo.matchingRule?.site || ""
        )
      }

      await redirectTabToBlockedPage(
        tabId,
        urlString,
        activeRuleInfo.matchingRule
      )

      return true
    }

    async function recordMatchedNavigation(details, nowMs = Date.now()) {
      const request = details?.request || {}
      const requestType = request.type || request.resourceType || ""
      const tabId =
        typeof request.tabId === "number" ? request.tabId : details?.tabId
      const urlString = request.url || details?.url || ""

      if (requestType !== "main_frame" || typeof tabId !== "number" || !urlString) {
        return false
      }

      const activeRuleInfo = getActiveBlockingRuleForUrl(urlString, currentRules)
      if (!activeRuleInfo.shouldBlock) {
        return false
      }

      if (!navigationDeduper.shouldCountNavigation(tabId, urlString, nowMs)) {
        return false
      }

      await recordBlockedNavigationAttempt(
        urlString,
        activeRuleInfo.matchingRule?.site || ""
      )

      return true
    }

    function registerListeners() {
      runtimeChrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type !== "rulesUpdated") {
          return false
        }

        loadRulesFromStorage()
          .then(() => sendResponse({ status: "ok" }))
          .catch((error) => {
            console.error("Failed to refresh rules after update.", error)
            sendResponse({ status: "error", message: error.message })
          })

        return true
      })

      runtimeChrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
        if (details.frameId !== 0) {
          return
        }

        await checkAndBlockIfNecessary(details.tabId, details.url)
      })

      runtimeChrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (
          !changeInfo.url ||
          (tab.status !== "complete" && tab.status !== "loading")
        ) {
          return
        }

        await checkAndBlockIfNecessary(tabId, changeInfo.url)
      })

      runtimeChrome.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name === "periodicRuleCheck") {
          await updateDeclarativeNetRequestRules()
        }
      })

      runtimeChrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(
        async (details) => {
          await recordMatchedNavigation(details)
        }
      )

      runtimeChrome.action.onClicked.addListener(() => {
        runtimeChrome.runtime.openOptionsPage()
      })
    }

    async function initialize() {
      registerListeners()
      await loadRulesFromStorage()

      runtimeChrome.alarms.get("periodicRuleCheck", (existingAlarm) => {
        if (!existingAlarm) {
          runtimeChrome.alarms.create("periodicRuleCheck", { periodInMinutes: 1 })
        }
      })
    }

    return {
      loadRulesFromStorage,
      updateDeclarativeNetRequestRules,
      checkAndBlockIfNecessary,
      recordMatchedNavigation,
      initialize,
      getCurrentRules() {
        return [...currentRules]
      },
      setCurrentRules(rules) {
        currentRules = normalizeRules(rules)
      },
    }
  }

  const canInitialize = Boolean(
    chromeApi?.storage?.local &&
      chromeApi?.tabs &&
      chromeApi?.runtime &&
      chromeApi?.declarativeNetRequest &&
      rulesApi &&
      statsApi
  )

  let controller = null

  return {
    canInitialize,
    createServiceWorkerController,
    initialize() {
      if (!canInitialize) {
        return null
      }

      if (!controller) {
        controller = createServiceWorkerController({
          chromeApi,
          rulesApi,
          statsApi,
        })
      }

      return controller.initialize()
    },
  }
})
