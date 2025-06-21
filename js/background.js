// js/background.js
console.log("Background Service Worker (declarativeNetRequest) started.")

// Path to the local blocking page, relative to extension root
const BLOCKED_EXTENSION_PATH = "/html/blocked.html"

let currentRules = [] // Holds the currently loaded rules

// --- Start Refactored Helper Functions ---

function normalizeDomain(site) {
  let inputSite = site.trim().toLowerCase()
  let primaryDomain = inputSite.startsWith("www.")
    ? inputSite.substring(4)
    : inputSite
  let wwwDomain = inputSite.startsWith("www.")
    ? inputSite
    : "www." + primaryDomain
  if (primaryDomain === wwwDomain && primaryDomain.startsWith("www.")) {
    primaryDomain = primaryDomain.substring(4)
  } else if (primaryDomain !== wwwDomain && !wwwDomain.startsWith("www.")) {
    wwwDomain = "www." + primaryDomain
  }
  return { primaryDomain, wwwDomain }
}

function normalizePath(path) {
  if (!path || typeof path !== "string") return "/"
  let cleanedPath = path.trim()
  if (!cleanedPath.startsWith("/")) {
    cleanedPath = "/" + cleanedPath
  }
  return cleanedPath
}

// Enhanced function to handle both paths and query parameters
function normalizeUrlPattern(urlPattern) {
  if (!urlPattern || typeof urlPattern !== "string") return "/"

  let cleanedPattern = urlPattern.trim()

  // If it doesn't start with /, add it
  if (!cleanedPattern.startsWith("/")) {
    cleanedPattern = "/" + cleanedPattern
  }

  return cleanedPattern
}

// Function to check if a URL matches a whitelist pattern (supports query parameters)
function urlMatchesPattern(url, pattern) {
  try {
    const parsedUrl = new URL(url)
    const fullPath = parsedUrl.pathname + parsedUrl.search // Includes query parameters

    // Special case: if pattern is "/" and path is "/", it's a match
    if (pattern === "/" && fullPath === "/") {
      return true
    }

    // Skip empty or invalid patterns
    if (
      !pattern ||
      pattern === "/" ||
      pattern.replace(/\*/g, "") === "" ||
      pattern.replace(/\*/g, "") === "/"
    ) {
      return false
    }

    // Handle different pattern types
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1)
      return fullPath.startsWith(prefix)
    } else if (pattern.endsWith("/")) {
      return fullPath.startsWith(pattern)
    } else {
      // For exact matches or contains matches
      return fullPath.includes(pattern)
    }
  } catch (e) {
    console.error("Error parsing URL in urlMatchesPattern:", url, e)
    return false
  }
}

function isRuleTimeActive(rule, currentTimeInMinutes) {
  if (rule.type !== "timed") {
    return true
  }
  if (!rule.startTime || !rule.endTime) {
    return false
  }
  const [startH, startM] = rule.startTime.split(":").map(Number)
  const [endH, endM] = rule.endTime.split(":").map(Number)
  const startTimeInMinutes = startH * 60 + startM
  const endTimeInMinutes = endH * 60 + endM

  if (startTimeInMinutes === endTimeInMinutes) {
    return false
  }
  if (startTimeInMinutes < endTimeInMinutes) {
    return (
      currentTimeInMinutes >= startTimeInMinutes &&
      currentTimeInMinutes < endTimeInMinutes
    )
  } else {
    return (
      currentTimeInMinutes >= startTimeInMinutes ||
      currentTimeInMinutes < endTimeInMinutes
    )
  }
}

// --- End Refactored Helper Functions ---

// Function to load rules from storage
async function loadRulesFromStorage() {
  try {
    const result = await chrome.storage.local.get(["blockedRules"])
    currentRules = result.blockedRules || []
    currentRules = currentRules.map((rule) => ({
      ...rule,
      subpageMode: rule.subpageMode || "none",
      subpageWhitelist: rule.subpageWhitelist || [],
      subpageBlacklist: rule.subpageBlacklist || [],
    }))
    console.log("Rules loaded and normalized from storage:", currentRules)
    await updateDeclarativeNetRequestRules()
  } catch (e) {
    console.error("Error loading rules:", e)
  }
}

// Define all resource types that should be blocked
const ALL_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "webtransport",
  "webbundle",
  "other",
]

// Only main frame for initial navigation blocking
const MAIN_FRAME_ONLY = ["main_frame"]

// Input Validation Helper Function
function validateDomainInput(domain) {
  if (!domain || typeof domain !== "string") {
    return false
  }

  const trimmedDomain = domain.trim().toLowerCase()

  if (trimmedDomain === "") {
    return false
  }

  // Basic domain validation regex
  const domainRegex =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

  if (!domainRegex.test(trimmedDomain)) {
    return false
  }

  // Additional checks for common invalid patterns
  if (
    trimmedDomain.includes("..") ||
    trimmedDomain.startsWith(".") ||
    trimmedDomain.endsWith(".")
  ) {
    return false
  }

  return true
}

// Converts our stored rules to declarativeNetRequest rules
function convertToDNRRules(storedRules) {
  const dnrRules = []
  let dnrRuleIdCounter = 1

  const now = new Date()
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes()
  console.log(
    "Starting conversion from storedRules to DNR:",
    JSON.parse(JSON.stringify(storedRules))
  )
  storedRules.forEach((rule, index) => {
    console.log(
      `Processing rule ${index} (before time check):`,
      JSON.parse(JSON.stringify(rule))
    )

    if (!validateDomainInput(rule.site)) {
      console.warn(`Invalid or empty rule site skipped (rule ${index}):`, rule)
      return
    }

    if (!isRuleTimeActive(rule, currentTimeInMinutes)) {
      console.log(
        `Rule ${index} (${rule.site}) is not time-active and will be skipped.`
      )
      return
    }
    console.log(`Rule ${index} (${rule.site}) is time-active.`)

    const { primaryDomain, wwwDomain } = normalizeDomain(rule.site)
    const evaluatedSubpageMode = rule.subpageMode || "none"
    console.log(
      `Rule ${index} (${rule.site}): Evaluated subpageMode = '${evaluatedSubpageMode}'. Original rule subpageMode = '${rule.subpageMode}'`
    )

    const createRuleEntry = (
      condition,
      actionType = "redirect",
      resourceTypes = ALL_RESOURCE_TYPES
    ) => {
      let action
      if (actionType === "redirect") {
        action = {
          type: "redirect",
          redirect: { extensionPath: BLOCKED_EXTENSION_PATH },
        }
      } else if (actionType === "block") {
        action = { type: "block" }
      } else {
        action = { type: "allow" }
      }

      return {
        id: dnrRuleIdCounter++,
        priority: action.type === "allow" ? 2 : 1,
        action: action,
        condition: { ...condition, resourceTypes: resourceTypes },
      }
    }

    if (evaluatedSubpageMode === "none") {
      console.log(
        `Rule ${index} (${rule.site}): Mode 'none' selected. Creating requestDomains rule.`
      )
      const domainsToBlock =
        primaryDomain === wwwDomain
          ? [primaryDomain]
          : [primaryDomain, wwwDomain]
      dnrRules.push(
        createRuleEntry(
          { requestDomains: domainsToBlock },
          "redirect",
          ALL_RESOURCE_TYPES
        )
      )
    } else if (evaluatedSubpageMode === "whitelist") {
      console.log(`Rule ${index} (${rule.site}): Mode 'whitelist' selected.`)
      const whitelistedPaths = rule.subpageWhitelist || []
      console.log(
        `Rule ${index} (${rule.site}): whitelistedPaths =`,
        JSON.parse(JSON.stringify(whitelistedPaths))
      )

      // For whitelist mode: Only block main_frame navigation to prevent initial page load
      // This allows all resources (scripts, CSS, AJAX, etc.) to load freely
      console.log(
        `Rule ${index} (${rule.site}): Creating main_frame-only redirect rule for domain '${primaryDomain}'.`
      )
      dnrRules.push(
        createRuleEntry(
          {
            urlFilter: `*://${primaryDomain}/*`,
          },
          "redirect",
          MAIN_FRAME_ONLY
        )
      )
      if (primaryDomain !== wwwDomain) {
        console.log(
          `Rule ${index} (${rule.site}): Creating main_frame-only redirect rule for www-domain '${wwwDomain}'.`
        )
        dnrRules.push(
          createRuleEntry(
            {
              urlFilter: `*://${wwwDomain}/*`,
            },
            "redirect",
            MAIN_FRAME_ONLY
          )
        )
      }
      if (whitelistedPaths.length > 0) {
        whitelistedPaths.forEach((path, pathIndex) => {
          let cleanPath = normalizeUrlPattern(path)
          console.log(
            `Rule ${index} (${rule.site}): Processing whitelist path #${pathIndex}: '${path}' (cleaned: '${cleanPath}')`
          )

          if (!cleanPath || (cleanPath === "/" && !(path.trim() === "/"))) {
            if (
              cleanPath.replace(/\*/g, "") === "" ||
              cleanPath.replace(/\*/g, "") === "/"
            ) {
              console.warn(
                `Rule ${index} (${rule.site}): Invalid whitelist path '${path}' (resulted in '${cleanPath}'). Skipped.`
              )
              return
            }
          }

          let allowPattern
          let wwwAllowPattern

          // Handle query parameters by using urlFilter with wildcards
          if (cleanPath.endsWith("*")) {
            allowPattern = `*://${primaryDomain}${cleanPath}`
            wwwAllowPattern = `*://${wwwDomain}${cleanPath}`
            console.log(
              `Rule ${index} (${rule.site}): Creating 'allow' rule (Type 1: user wildcard) for pattern: '${allowPattern}'`
            )
          } else if (cleanPath.endsWith("/")) {
            allowPattern = `*://${primaryDomain}${cleanPath}*`
            wwwAllowPattern = `*://${wwwDomain}${cleanPath}*`
            console.log(
              `Rule ${index} (${rule.site}): Creating 'allow' rule (Type 2: ends with slash) for pattern: '${allowPattern}'`
            )
          } else if (cleanPath.includes("?")) {
            // Special handling for query parameters - match exact pattern
            allowPattern = `*://${primaryDomain}${cleanPath}*`
            wwwAllowPattern = `*://${wwwDomain}${cleanPath}*`
            console.log(
              `Rule ${index} (${rule.site}): Creating 'allow' rule (Type 3: query parameter) for pattern: '${allowPattern}'`
            )
          } else {
            // For path segments without query parameters, use contains matching
            allowPattern = `*://${primaryDomain}*${cleanPath}*`
            wwwAllowPattern = `*://${wwwDomain}*${cleanPath}*`
            console.log(
              `Rule ${index} (${rule.site}): Creating 'allow' rule (Type 4: path segment contains) for pattern: '${allowPattern}'`
            )
          }

          // Create allow rules for main_frame navigation to whitelisted paths
          dnrRules.push(
            createRuleEntry(
              { urlFilter: allowPattern },
              "allow",
              MAIN_FRAME_ONLY
            )
          )
          if (primaryDomain !== wwwDomain) {
            console.log(
              `Rule ${index} (${rule.site}): Creating 'allow' rule for www-pattern: '${wwwAllowPattern}'`
            )
            dnrRules.push(
              createRuleEntry(
                { urlFilter: wwwAllowPattern },
                "allow",
                MAIN_FRAME_ONLY
              )
            )
          }
        })
      } else {
        console.log(
          `Rule ${index} (${rule.site}): Whitelist mode but no paths. Domain remains blocked by general rule.`
        )
      }
    } else if (evaluatedSubpageMode === "blacklist") {
      console.log(`Rule ${index} (${rule.site}): Mode 'blacklist' selected.`)
      const blacklistedPaths = rule.subpageBlacklist || []
      console.log(
        `Rule ${index} (${rule.site}): blacklistedPaths =`,
        JSON.parse(JSON.stringify(blacklistedPaths))
      )

      if (blacklistedPaths.length === 0) {
        console.log(
          `Rule ${index} (${rule.site}): Blacklist mode but blacklist is empty. No specific block rule for subpaths created. Domain remains accessible unless there's another rule.`
        )
      } else {
        blacklistedPaths.forEach((path, pathIndex) => {
          const originalUserPath = path
          console.log(
            `Rule ${index} (${rule.site}): Processing blacklist path #${pathIndex}: '${originalUserPath}'`
          )

          if (!originalUserPath || originalUserPath.trim() === "") {
            console.warn(
              `Rule ${index} (${rule.site}): Empty blacklist path skipped.`
            )
            return
          }

          let preparedPath = normalizeUrlPattern(originalUserPath)
          let filterPattern
          let wwwFilterPattern

          // Handle query parameters for blacklist patterns
          if (preparedPath.endsWith("*")) {
            filterPattern = `*://${primaryDomain}${preparedPath}`
            wwwFilterPattern = `*://${wwwDomain}${preparedPath}`
            console.log(
              `Rule ${index} (${rule.site}): Creating redirect rule (Blacklist Type 1: user wildcard) for pattern '${filterPattern}'`
            )
          } else if (preparedPath.endsWith("/")) {
            filterPattern = `*://${primaryDomain}${preparedPath}*`
            wwwFilterPattern = `*://${wwwDomain}${preparedPath}*`
            console.log(
              `Rule ${index} (${rule.site}): Creating redirect rule (Blacklist Type 2: ends with slash) for pattern '${filterPattern}'`
            )
          } else if (preparedPath.includes("?")) {
            // Special handling for query parameters in blacklist
            filterPattern = `*://${primaryDomain}${preparedPath}*`
            wwwFilterPattern = `*://${wwwDomain}${preparedPath}*`
            console.log(
              `Rule ${index} (${rule.site}): Creating redirect rule (Blacklist Type 3: query parameter) for pattern '${filterPattern}'`
            )
          } else {
            filterPattern = `*://${primaryDomain}*${preparedPath}*`
            wwwFilterPattern = `*://${wwwDomain}*${preparedPath}*`
            console.log(
              `Rule ${index} (${rule.site}): Creating redirect rule (Blacklist Type 4: path segment contains) for pattern '${filterPattern}'`
            )
          }

          // For blacklist mode: Block all resource types for the blacklisted paths
          dnrRules.push(
            createRuleEntry(
              { urlFilter: filterPattern },
              "redirect",
              ALL_RESOURCE_TYPES
            )
          )
          if (primaryDomain !== wwwDomain) {
            dnrRules.push(
              createRuleEntry(
                { urlFilter: wwwFilterPattern },
                "redirect",
                ALL_RESOURCE_TYPES
              )
            )
          }
        })
      }
    } else {
      console.warn(
        `Rule ${index} (${rule.site}): Unknown subpageMode '${evaluatedSubpageMode}'. No rule created.`
      )
    }
  })
  console.log(
    "Converted DNR rules (before return):",
    JSON.parse(JSON.stringify(dnrRules))
  )
  return dnrRules
}

// Updates rules in the declarativeNetRequest system
async function updateDeclarativeNetRequestRules() {
  const newDNRRules = convertToDNRRules(currentRules)

  try {
    const existingDNRRules =
      await chrome.declarativeNetRequest.getDynamicRules()
    const removeRuleIds = existingDNRRules.map((rule) => rule.id)

    const oldRulesSignature = JSON.stringify(
      existingDNRRules.map((r) => ({
        action: r.action,
        condition: r.condition,
        priority: r.priority,
      }))
    )
    const newRulesSignature = JSON.stringify(
      newDNRRules.map((r) => ({
        action: r.action,
        condition: r.condition,
        priority: r.priority,
      }))
    )

    if (removeRuleIds.length === 0 && newDNRRules.length === 0) {
      console.log("Keine DNR Regeln vorhanden und keine neuen hinzuzufügen.")
      return
    }

    if (
      oldRulesSignature === newRulesSignature &&
      removeRuleIds.length === newDNRRules.length
    ) {
      console.log(
        "Keine tatsächlichen Änderungen an den DNR Regeln festgestellt. Update übersprungen."
      )
      return
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeRuleIds,
      addRules: newDNRRules,
    })

    console.log("DeclarativeNetRequest Regeln erfolgreich aktualisiert.")
    const finalActiveRules =
      await chrome.declarativeNetRequest.getDynamicRules()
    console.log(
      "Aktive DNR-Regeln nach Update:",
      finalActiveRules.length,
      finalActiveRules.map((r) => ({
        id: r.id,
        priority: r.priority,
        action: r.action.type,
        condition: r.condition.requestDomains || r.condition.urlFilter,
      }))
    )
  } catch (e) {
    console.error("Fehler beim Aktualisieren der DNR-Regeln:", e)
    console.error(
      "Details: currentRules (aus storage):",
      JSON.stringify(currentRules)
    )
    console.error(
      "Details: newDNRRules (konvertiert für Update):",
      JSON.stringify(newDNRRules)
    )
    const existingRulesForErrorLog = await chrome.declarativeNetRequest
      .getDynamicRules()
      .catch(() => [])
    console.error(
      "Details: existingDNRRules (zum Zeitpunkt des Fehlers):",
      JSON.stringify(existingRulesForErrorLog)
    )
  }
}

// Listener für Nachrichten von options.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "rulesUpdated") {
    console.log(
      "Nachricht 'rulesUpdated' erhalten. Lade Regeln neu und aktualisiere DNR."
    )
    loadRulesFromStorage()
      .then(() => {
        sendResponse({ status: "Regeln im Hintergrund (DNR) aktualisiert" })
      })
      .catch((error) => {
        console.error("Fehler bei Verarbeitung von rulesUpdated:", error)
        sendResponse({
          status: "Fehler bei Regelaktualisierung",
          error: error.message,
        })
      })
    return true
  }
  return false
})

// Funktion, um zu prüfen, ob die aktuelle URL basierend auf den Regeln blockiert werden soll
// und ggf. programmatisch umzuleiten. (Für SPA Navigation)
async function checkAndBlockIfNecessary(tabId, urlString) {
  if (!urlString) return

  const activeRuleInfo = getActiveBlockingRuleForUrl(urlString, currentRules)
  if (activeRuleInfo.shouldBlock) {
    console.log(
      `Programmatische Blockierung für URL: ${urlString} in Tab ${tabId} aufgrund der Regel: `,
      activeRuleInfo.matchingRule
    )
    try {
      await chrome.tabs.update(tabId, {
        url:
          chrome.runtime.getURL(BLOCKED_EXTENSION_PATH) +
          `?url=${encodeURIComponent(urlString)}`,
      })
      console.log(`Tab ${tabId} erfolgreich zu Blockseite umgeleitet.`)
    } catch (e) {
      console.error(
        `Fehler beim programmatischen Umleiten von Tab ${tabId}:`,
        e
      )
    }
  }
}

// Angepasste Logik für SPA-Checks, spiegelt DNR-Logik wider
function getActiveBlockingRuleForUrl(urlString, storedRules) {
  const now = new Date()
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes()

  try {
    const parsedUrl = new URL(urlString)
    const hostname = parsedUrl.hostname.toLowerCase()
    const pathname = parsedUrl.pathname

    for (const rule of storedRules) {
      if (!validateDomainInput(rule.site)) {
        continue
      }
      if (!isRuleTimeActive(rule, currentTimeInMinutes)) {
        continue
      }

      const { primaryDomain, wwwDomain } = normalizeDomain(rule.site)

      if (hostname !== primaryDomain && hostname !== wwwDomain) {
        continue
      }

      const evaluatedSubpageMode = rule.subpageMode || "none"

      if (evaluatedSubpageMode === "none") {
        console.log(
          `getActiveBlockingRuleForUrl: Rule 'none' matches ${urlString}`,
          rule
        )
        return { shouldBlock: true, matchingRule: rule }
      } else if (evaluatedSubpageMode === "whitelist") {
        const whitelistedPaths = rule.subpageWhitelist || []
        let isPathWhitelisted = false
        if (whitelistedPaths.length === 0) {
          console.log(
            `getActiveBlockingRuleForUrl: Rule 'whitelist' (empty list) blocks ${urlString}`,
            rule
          )
          return { shouldBlock: true, matchingRule: rule }
        }
        for (const whitelistedPath of whitelistedPaths) {
          const cleanWhitelistedPath = normalizeUrlPattern(whitelistedPath)

          // Use the new URL matching function that supports query parameters
          if (urlMatchesPattern(urlString, cleanWhitelistedPath)) {
            isPathWhitelisted = true
            console.log(
              `getActiveBlockingRuleForUrl: URL ${urlString} matches whitelist pattern '${cleanWhitelistedPath}'`
            )
            break
          }
        }
        if (!isPathWhitelisted) {
          console.log(
            `getActiveBlockingRuleForUrl: Rule 'whitelist' blocks ${urlString} (not on whitelist)`,
            rule
          )
          return { shouldBlock: true, matchingRule: rule }
        }
      } else if (evaluatedSubpageMode === "blacklist") {
        const blacklistedPaths = rule.subpageBlacklist || []
        if (blacklistedPaths.length === 0) {
          continue
        }
        for (const blacklistedPath of blacklistedPaths) {
          const cleanBlacklistedPath = normalizeUrlPattern(blacklistedPath)

          // Use the new URL matching function that supports query parameters
          if (urlMatchesPattern(urlString, cleanBlacklistedPath)) {
            console.log(
              `getActiveBlockingRuleForUrl: Rule 'blacklist' blocks ${urlString} (matches pattern ${cleanBlacklistedPath})`,
              rule
            )
            return { shouldBlock: true, matchingRule: rule }
          }
        }
      }
    }
  } catch (e) {
    console.error(
      "Fehler in getActiveBlockingRuleForUrl für URL:",
      urlString,
      e
    )
    return { shouldBlock: false }
  }
  return { shouldBlock: false }
}

// Listener für SPA-Navigationen und andere Tab-Updates
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId === 0) {
    await checkAndBlockIfNecessary(details.tabId, details.url)
  }
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.url &&
    (tab.status === "complete" || tab.status === "loading")
  ) {
    if (tab.id === tabId) {
      await checkAndBlockIfNecessary(tabId, changeInfo.url)
    }
  }
})

// Alarme für zeitbasierte Regeln
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodicRuleCheck") {
    await updateDeclarativeNetRequestRules()
  }
})

// Listener für Klick auf das Action-Icon der Erweiterung
chrome.action.onClicked.addListener((tab) => {
  console.log("Action icon clicked, opening options page.")
  chrome.runtime.openOptionsPage()
})

// Initialisierung beim Start des Service Workers
async function initialize() {
  console.log("Initialisiere Extension (DNR)...")
  await loadRulesFromStorage()

  chrome.alarms.get("periodicRuleCheck", (existingAlarm) => {
    if (!existingAlarm) {
      chrome.alarms.create("periodicRuleCheck", { periodInMinutes: 1 })
      console.log(
        "Periodischer Alarm 'periodicRuleCheck' erstellt (alle 1 Minute)."
      )
    } else {
      console.log("Periodischer Alarm 'periodicRuleCheck' existiert bereits.")
    }
  })
}

initialize()
