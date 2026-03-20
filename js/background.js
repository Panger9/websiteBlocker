importScripts("rule-engine.js")

const DEBUG = false
const { RULES_STORAGE_KEY } = SiteBlockerRules

let currentRules = []

function debugLog(...args) {
  if (DEBUG) {
    console.log("[SiteBlocker]", ...args)
  }
}

async function loadRulesFromStorage() {
  try {
    const result = await chrome.storage.local.get([RULES_STORAGE_KEY])
    currentRules = SiteBlockerRules.normalizeRules(result[RULES_STORAGE_KEY] || [])
    await updateDeclarativeNetRequestRules()
  } catch (error) {
    console.error("Failed to load rules from storage.", error)
  }
}

async function updateDeclarativeNetRequestRules() {
  const nextRules = SiteBlockerRules.buildDnrRules(currentRules)

  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
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

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: nextRules,
    })
  } catch (error) {
    console.error("Failed to update dynamic rules.", error)
    debugLog("Current rules", currentRules)
    debugLog("Generated DNR rules", nextRules)
  }
}

async function redirectTabToBlockedPage(tabId, blockedUrl, rule) {
  try {
    const pagePath = SiteBlockerRules.buildBlockedPageUrl(rule, blockedUrl).slice(1)
    await chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL(pagePath),
    })
  } catch (error) {
    console.error("Failed to redirect blocked tab.", error)
  }
}

async function checkAndBlockIfNecessary(tabId, urlString) {
  if (!urlString) {
    return
  }

  const activeRuleInfo = SiteBlockerRules.getActiveBlockingRuleForUrl(
    urlString,
    currentRules
  )

  if (!activeRuleInfo.shouldBlock) {
    return
  }

  await redirectTabToBlockedPage(
    tabId,
    urlString,
    activeRuleInfo.matchingRule
  )
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) {
    return
  }

  await checkAndBlockIfNecessary(details.tabId, details.url)
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url || (tab.status !== "complete" && tab.status !== "loading")) {
    return
  }

  await checkAndBlockIfNecessary(tabId, changeInfo.url)
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodicRuleCheck") {
    await updateDeclarativeNetRequestRules()
  }
})

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})

async function initialize() {
  await loadRulesFromStorage()

  chrome.alarms.get("periodicRuleCheck", (existingAlarm) => {
    if (!existingAlarm) {
      chrome.alarms.create("periodicRuleCheck", { periodInMinutes: 1 })
    }
  })
}

initialize()
