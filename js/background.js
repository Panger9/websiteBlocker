// js/background.js
console.log("Background Service Worker (declarativeNetRequest) gestartet.")

// Path zur lokalen Blockierseite, relativ zum Extension-Root
const BLOCKED_EXTENSION_PATH = "/html/blocked.html"

let currentRules = [] // Hält die aktuell geladenen Regeln

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

// Funktion zum Laden der Regeln aus dem Speicher
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
    console.log("Regeln aus Storage geladen und normalisiert:", currentRules)
    await updateDeclarativeNetRequestRules()
  } catch (e) {
    console.error("Fehler beim Laden der Regeln:", e)
  }
}

// Definiere alle Ressourcentypen, die blockiert werden sollen
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

// Wandelt unsere gespeicherten Regeln in declarativeNetRequest-Regeln um
function convertToDNRRules(storedRules) {
  const dnrRules = []
  let dnrRuleIdCounter = 1

  const now = new Date()
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes()
  console.log(
    "Starte Konvertierung von storedRules zu DNR:",
    JSON.parse(JSON.stringify(storedRules))
  )

  storedRules.forEach((rule, index) => {
    console.log(
      `Verarbeite Regel ${index} (vor Zeitcheck):`,
      JSON.parse(JSON.stringify(rule))
    )

    if (
      !rule.site ||
      typeof rule.site !== "string" ||
      rule.site.trim() === ""
    ) {
      console.warn(
        `Ungültige oder leere Regel-Site übersprungen (Regel ${index}):`,
        rule
      )
      return
    }

    if (!isRuleTimeActive(rule, currentTimeInMinutes)) {
      console.log(
        `Regel ${index} (${rule.site}) ist zeitlich nicht aktiv und wird übersprungen.`
      )
      return
    }
    console.log(`Regel ${index} (${rule.site}) ist zeitlich aktiv.`)

    const { primaryDomain, wwwDomain } = normalizeDomain(rule.site)
    const evaluatedSubpageMode = rule.subpageMode || "none"
    console.log(
      `Regel ${index} (${rule.site}): Ausgewerteter subpageMode = '${evaluatedSubpageMode}'. Regel-Original subpageMode = '${rule.subpageMode}'`
    )

    const createRuleEntry = (condition, actionType = "redirect") => {
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
        condition: { ...condition, resourceTypes: ALL_RESOURCE_TYPES },
      }
    }

    if (evaluatedSubpageMode === "none") {
      console.log(
        `Regel ${index} (${rule.site}): Modus 'none' gewählt. Erstelle requestDomains Regel.`
      )
      const domainsToBlock =
        primaryDomain === wwwDomain
          ? [primaryDomain]
          : [primaryDomain, wwwDomain]
      dnrRules.push(createRuleEntry({ requestDomains: domainsToBlock }))
    } else if (evaluatedSubpageMode === "whitelist") {
      console.log(`Regel ${index} (${rule.site}): Modus 'whitelist' gewählt.`)
      const whitelistedPaths = rule.subpageWhitelist || []
      console.log(
        `Regel ${index} (${rule.site}): whitelistedPaths =`,
        JSON.parse(JSON.stringify(whitelistedPaths))
      )

      console.log(
        `Regel ${index} (${rule.site}): Erstelle generelle redirect Regel für Domain '${primaryDomain}'.`
      )
      dnrRules.push(
        createRuleEntry({
          urlFilter: `*://${primaryDomain}/*`,
        })
      )
      if (primaryDomain !== wwwDomain) {
        console.log(
          `Regel ${index} (${rule.site}): Erstelle generelle redirect Regel für www-Domain '${wwwDomain}'.`
        )
        dnrRules.push(
          createRuleEntry({
            urlFilter: `*://${wwwDomain}/*`,
          })
        )
      }

      if (whitelistedPaths.length > 0) {
        whitelistedPaths.forEach((path, pathIndex) => {
          let cleanPath = normalizePath(path)
          console.log(
            `Regel ${index} (${rule.site}): Verarbeite Whitelist-Pfad #${pathIndex}: '${path}' (cleaned: '${cleanPath}')`
          )

          if (!cleanPath || (cleanPath === "/" && !(path.trim() === "/"))) {
            if (
              cleanPath.replace(/\*/g, "") === "" ||
              cleanPath.replace(/\*/g, "") === "/"
            ) {
              console.warn(
                `Regel ${index} (${rule.site}): Ungültiger Whitelist-Pfad '${path}' (ergab '${cleanPath}'). Übersprungen.`
              )
              return
            }
          }

          let allowPattern
          let wwwAllowPattern

          if (cleanPath.endsWith("*")) {
            allowPattern = `*://${primaryDomain}${cleanPath}`
            wwwAllowPattern = `*://${wwwDomain}${cleanPath}`
            console.log(
              `Regel ${index} (${rule.site}): Erstelle 'allow' Regel (Typ 1: user wildcard) für Muster: '${allowPattern}'`
            )
          } else if (cleanPath.endsWith("/")) {
            allowPattern = `*://${primaryDomain}${cleanPath}*`
            wwwAllowPattern = `*://${wwwDomain}${cleanPath}*`
            console.log(
              `Regel ${index} (${rule.site}): Erstelle 'allow' Regel (Typ 2: ends with slash) für Muster: '${allowPattern}'`
            )
          } else {
            allowPattern = `*://${primaryDomain}*${cleanPath}*`
            wwwAllowPattern = `*://${wwwDomain}*${cleanPath}*`
            console.log(
              `Regel ${index} (${rule.site}): Erstelle 'allow' Regel (Typ 3: path segment contains) für Muster: '${allowPattern}'`
            )
          }

          dnrRules.push(createRuleEntry({ urlFilter: allowPattern }, "allow"))
          if (primaryDomain !== wwwDomain) {
            console.log(
              `Regel ${index} (${rule.site}): Erstelle 'allow' Regel für www-Muster: '${wwwAllowPattern}'`
            )
            dnrRules.push(
              createRuleEntry({ urlFilter: wwwAllowPattern }, "allow")
            )
          }
        })
      } else {
        console.log(
          `Regel ${index} (${rule.site}): Whitelist-Modus aber keine Pfade. Domain bleibt durch generelle Regel blockiert.`
        )
      }
    } else if (evaluatedSubpageMode === "blacklist") {
      console.log(`Regel ${index} (${rule.site}): Modus 'blacklist' gewählt.`)
      const blacklistedPaths = rule.subpageBlacklist || []
      console.log(
        `Regel ${index} (${rule.site}): blacklistedPaths =`,
        JSON.parse(JSON.stringify(blacklistedPaths))
      )

      if (blacklistedPaths.length === 0) {
        console.log(
          `Regel ${index} (${rule.site}): Blacklist-Modus aber Blacklist ist leer. Keine spezifische Blockregel für Subpfade erstellt. Domain bleibt zugänglich, es sei denn, es gibt eine andere Regel.`
        )
      } else {
        blacklistedPaths.forEach((path, pathIndex) => {
          const originalUserPath = path
          console.log(
            `Regel ${index} (${rule.site}): Verarbeite Blacklist-Pfad #${pathIndex}: '${originalUserPath}'`
          )

          if (!originalUserPath || originalUserPath.trim() === "") {
            console.warn(
              `Regel ${index} (${rule.site}): Leeren Blacklist-Pfad übersprungen.`
            )
            return
          }

          let preparedPath = normalizePath(originalUserPath)
          let filterPattern
          let wwwFilterPattern

          if (preparedPath.endsWith("*")) {
            filterPattern = `*://${primaryDomain}${preparedPath}`
            wwwFilterPattern = `*://${wwwDomain}${preparedPath}`
            console.log(
              `Regel ${index} (${rule.site}): Erstelle redirect Regel (Blacklist Typ 1: user wildcard) für Muster '${filterPattern}'`
            )
          } else if (preparedPath.endsWith("/")) {
            filterPattern = `*://${primaryDomain}${preparedPath}*`
            wwwFilterPattern = `*://${wwwDomain}${preparedPath}*`
            console.log(
              `Regel ${index} (${rule.site}): Erstelle redirect Regel (Blacklist Typ 2: ends with slash) für Muster '${filterPattern}'`
            )
          } else {
            filterPattern = `*://${primaryDomain}*${preparedPath}*`
            wwwFilterPattern = `*://${wwwDomain}*${preparedPath}*`
            console.log(
              `Regel ${index} (${rule.site}): Erstelle redirect Regel (Blacklist Typ 3: path segment contains) für Muster '${filterPattern}'`
            )
          }

          dnrRules.push(createRuleEntry({ urlFilter: filterPattern }))
          if (primaryDomain !== wwwDomain) {
            dnrRules.push(createRuleEntry({ urlFilter: wwwFilterPattern }))
          }
        })
      }
    } else {
      console.warn(
        `Regel ${index} (${rule.site}): Unbekannter subpageMode '${evaluatedSubpageMode}'. Keine Regel erstellt.`
      )
    }
  })

  console.log(
    "Konvertierte DNR Regeln (vor Rückgabe):",
    JSON.parse(JSON.stringify(dnrRules))
  )
  return dnrRules
}

// Aktualisiert die Regeln im declarativeNetRequest System
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
      if (
        !rule.site ||
        typeof rule.site !== "string" ||
        rule.site.trim() === ""
      ) {
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
          `getActiveBlockingRuleForUrl: Regel 'none' matcht ${urlString}`,
          rule
        )
        return { shouldBlock: true, matchingRule: rule }
      } else if (evaluatedSubpageMode === "whitelist") {
        const whitelistedPaths = rule.subpageWhitelist || []
        let isPathWhitelisted = false
        if (whitelistedPaths.length === 0) {
          console.log(
            `getActiveBlockingRuleForUrl: Regel 'whitelist' (leere Liste) blockiert ${urlString}`,
            rule
          )
          return { shouldBlock: true, matchingRule: rule }
        }

        for (const whitelistedPath of whitelistedPaths) {
          const cleanWhitelistedPath = normalizePath(whitelistedPath)

          if (cleanWhitelistedPath === "/" && pathname === "/") {
            isPathWhitelisted = true
            break
          }
          if (
            cleanWhitelistedPath === "/" ||
            cleanWhitelistedPath.replace(/\*/g, "") === ""
          )
            continue

          if (cleanWhitelistedPath.endsWith("*")) {
            const prefix = cleanWhitelistedPath.slice(0, -1)
            if (pathname.startsWith(prefix)) {
              isPathWhitelisted = true
              break
            }
          } else if (cleanWhitelistedPath.endsWith("/")) {
            if (pathname.startsWith(cleanWhitelistedPath)) {
              isPathWhitelisted = true
              break
            }
          } else {
            if (pathname.includes(cleanWhitelistedPath)) {
              isPathWhitelisted = true
              break
            }
          }
        }

        if (!isPathWhitelisted) {
          console.log(
            `getActiveBlockingRuleForUrl: Regel 'whitelist' blockiert ${urlString} (nicht auf Whitelist)`,
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
          const cleanBlacklistedPath = normalizePath(blacklistedPath)

          if (cleanBlacklistedPath === "/" && pathname === "/") {
            console.log(
              `getActiveBlockingRuleForUrl: Regel 'blacklist' blockiert ${urlString} (matcht ${cleanBlacklistedPath})`,
              rule
            )
            return { shouldBlock: true, matchingRule: rule }
          }
          if (
            cleanBlacklistedPath === "/" ||
            cleanBlacklistedPath.replace(/\*/g, "") === ""
          )
            continue

          if (cleanBlacklistedPath.endsWith("*")) {
            const prefix = cleanBlacklistedPath.slice(0, -1)
            if (pathname.startsWith(prefix)) {
              console.log(
                `getActiveBlockingRuleForUrl: Regel 'blacklist' blockiert ${urlString} (matcht wildcard ${cleanBlacklistedPath})`,
                rule
              )
              return { shouldBlock: true, matchingRule: rule }
            }
          } else if (cleanBlacklistedPath.endsWith("/")) {
            if (pathname.startsWith(cleanBlacklistedPath)) {
              console.log(
                `getActiveBlockingRuleForUrl: Regel 'blacklist' blockiert ${urlString} (matcht Verzeichnis ${cleanBlacklistedPath})`,
                rule
              )
              return { shouldBlock: true, matchingRule: rule }
            }
          } else {
            if (pathname.includes(cleanBlacklistedPath)) {
              console.log(
                `getActiveBlockingRuleForUrl: Regel 'blacklist' blockiert ${urlString} (enthält ${cleanBlacklistedPath})`,
                rule
              )
              return { shouldBlock: true, matchingRule: rule }
            }
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
