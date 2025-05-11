// js/background.js
console.log("Background Service Worker (declarativeNetRequest) gestartet.")

const BLOCKED_PAGE_URL = chrome.runtime.getURL("html/blocked.html")
const ALWAYS_BLOCK_RULE_ID_PREFIX = 1000 // Start-ID für "immer blockieren" Regeln
const TIMED_BLOCK_RULE_ID_PREFIX = 2000 // Start-ID für "zeitbasierte" Regeln

let currentRules = [] // Hält die aktuell im Speicher geladenen Regeln aus options.js

// Funktion zum Laden der Regeln aus dem Speicher
async function loadRulesFromStorage() {
  try {
    const result = await chrome.storage.local.get(["blockedRules"])
    currentRules = result.blockedRules || []
    console.log("Regeln aus Storage geladen:", currentRules)
    await updateDeclarativeNetRequestRules()
  } catch (e) {
    console.error("Fehler beim Laden der Regeln:", e)
  }
}

// Wandelt unsere gespeicherten Regeln in declarativeNetRequest-Regeln um
function convertToDNRRules(storedRules) {
  const dnrRules = []
  let alwaysBlockCounter = 0
  let timedBlockCounter = 0

  const now = new Date()
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes()

  storedRules.forEach((rule) => {
    // 'index' wird nicht mehr benötigt hier
    let ruleId
    let isActive = false
    let conditionUrlFilterPart // Teil für den URL-Filter

    // Normalisiere die Site-URL für den Filter
    let normalizedSite = rule.site.toLowerCase().replace(/^www\./, "")
    // Entferne Protokolle, falls vorhanden, und alles nach dem ersten /
    normalizedSite = normalizedSite.replace(/^(?:https?:\/\/)?([^/]+).*$/, "$1")

    if (rule.type === "always") {
      ruleId = ALWAYS_BLOCK_RULE_ID_PREFIX + alwaysBlockCounter++
      isActive = true
    } else if (rule.type === "timed") {
      ruleId = TIMED_BLOCK_RULE_ID_PREFIX + timedBlockCounter++
      const startTimeInMinutes =
        parseInt(rule.startTime.split(":")[0]) * 60 +
        parseInt(rule.startTime.split(":")[1])
      const endTimeInMinutes =
        parseInt(rule.endTime.split(":")[0]) * 60 +
        parseInt(rule.endTime.split(":")[1])

      if (startTimeInMinutes === endTimeInMinutes) {
        isActive = false // Blockieren für 0 Minuten ist nicht aktiv
      } else if (startTimeInMinutes < endTimeInMinutes) {
        // Normalfall: Startzeit ist vor Endzeit am selben Tag
        if (
          currentTimeInMinutes >= startTimeInMinutes &&
          currentTimeInMinutes < endTimeInMinutes
        ) {
          isActive = true
        }
      } else {
        // Zeitfenster überbrückt Mitternacht (z.B. 22:00 - 02:00), d.h. startTimeInMinutes > endTimeInMinutes
        if (
          currentTimeInMinutes >= startTimeInMinutes ||
          currentTimeInMinutes < endTimeInMinutes
        ) {
          isActive = true
        }
      }
    }

    if (isActive) {
      // Verwende requestDomains für einfache Domain-Blockierung.
      // Wenn normalizedSite "example.com" ist, blockiert dies example.com und www.example.com
      // aber nicht sub.example.com. Für Subdomains müsste man den Filter anpassen oder
      // den Nutzer bitten, *.example.com einzugeben und dann urlFilter oder regexFilter verwenden.
      // Für dieses Beispiel bleiben wir bei requestDomains für die vom Nutzer eingegebene Domain.
      dnrRules.push({
        id: ruleId,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { url: BLOCKED_PAGE_URL },
        },
        condition: {
          requestDomains: [normalizedSite], // Blockiert die exakte Domain und www. Subdomain
          // Falls du generischer blockieren willst (inkl. aller Subdomains) bei Eingabe von "example.com":
          // urlFilter: `||${normalizedSite}/`, // AdBlock Plus-ähnliche Syntax
          resourceTypes: ["main_frame", "sub_frame"],
        },
      })
    }
  })
  return dnrRules
}

// Aktualisiert die Regeln im declarativeNetRequest System
async function updateDeclarativeNetRequestRules() {
  const newDNRRules = convertToDNRRules(currentRules) // Diese sind die Regeln, die jetzt aktiv sein SOLLEN

  try {
    const existingDNRRules =
      await chrome.declarativeNetRequest.getDynamicRules()
    const existingRuleIds = existingDNRRules.map((rule) => rule.id)

    // Wir entfernen ALLE existierenden dynamischen Regeln, die von dieser Extension verwaltet werden könnten.
    // Und fügen dann alle Regeln hinzu, die laut currentRules jetzt aktiv sein sollen.
    // Dies ist der einfachste Weg, um ID-Konflikte und Zustandsinkonsistenzen zu vermeiden.
    // Wichtig: removeRuleIds und addRules müssen Arrays sein, auch wenn sie leer sind.

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds.length > 0 ? existingRuleIds : [], // Alle alten IDs entfernen
      addRules: newDNRRules.length > 0 ? newDNRRules : [], // Alle neuen, jetzt aktiven Regeln hinzufügen
    })

    console.log("DeclarativeNetRequest Regeln aktualisiert.")
    // Detailliertere Logausgabe nach dem Update:
    const finalActiveRules =
      await chrome.declarativeNetRequest.getDynamicRules()
    console.log(
      "Aktive DNR-Regeln nach Update:",
      finalActiveRules.length,
      finalActiveRules.map((r) => ({
        id: r.id,
        domain: r.condition.requestDomains
          ? r.condition.requestDomains[0]
          : r.condition.urlFilter || "N/A",
      }))
    )
  } catch (e) {
    console.error("Fehler beim Aktualisieren der DNR-Regeln:", e)
    // Detailliertere Infos bei Fehler ausgeben
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

// Listener für Änderungen an den Regeln (von options.js gesendet)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "rulesUpdated") {
    console.log(
      "Nachricht 'rulesUpdated' erhalten. Lade Regeln neu und aktualisiere DNR."
    )
    loadRulesFromStorage() // Dies ruft intern updateDeclarativeNetRequestRules auf
    sendResponse({ status: "Regeln im Hintergrund (DNR) aktualisiert" })
  }
  return true // Wichtig für asynchrone sendResponse, falls loadRulesFromStorage komplexer wird
})

// Alarme für zeitbasierte Regeln
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodicRuleCheck") {
    // console.log("Alarm 'periodicRuleCheck' ausgelöst um", new Date().toLocaleTimeString(), ". Überprüfe zeitbasierte DNR-Regeln.");
    // Die Logik in convertToDNRRules berücksichtigt bereits die aktuelle Zeit.
    // Ein Aufruf von updateDeclarativeNetRequestRules genügt, um Regeln zu aktivieren/deaktivieren.
    await updateDeclarativeNetRequestRules()
  }
})

// Initialisierung beim Start des Service Workers
async function initialize() {
  console.log("Initialisiere Extension (DNR)...")
  await loadRulesFromStorage() // Lädt Regeln und wendet sie initial an

  // Erstelle einen periodischen Alarm, um zeitbasierte Regeln zu aktualisieren
  chrome.alarms.get("periodicRuleCheck", (existingAlarm) => {
    if (!existingAlarm) {
      chrome.alarms.create("periodicRuleCheck", {
        delayInMinutes: 0.2, // Starte bald (z.B. nach 12 Sekunden)
        periodInMinutes: 1, // Wiederhole jede Minute
      })
      console.log("Alarm 'periodicRuleCheck' erstellt.")
    } else {
      console.log("Alarm 'periodicRuleCheck' existiert bereits.")
    }
  })
}

initialize()
