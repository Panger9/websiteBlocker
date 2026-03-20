(function (root, factory) {
  const api = factory()

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api
  }

  root.SiteBlockerRules = api
})(typeof globalThis !== "undefined" ? globalThis : self, function () {
  const BLOCKED_PAGE_PATH = "/html/blocked.html"
  const RULES_STORAGE_KEY = "blockedRules"
  const RULE_TYPES = {
    ALWAYS: "always",
    TIMED: "timed",
  }
  const SUBPAGE_MODES = {
    NONE: "none",
    WHITELIST: "whitelist",
    BLACKLIST: "blacklist",
  }
  const DAYS_OF_WEEK = [
    { key: "mon", index: 1, shortLabel: "Mon", longLabel: "Monday" },
    { key: "tue", index: 2, shortLabel: "Tue", longLabel: "Tuesday" },
    { key: "wed", index: 3, shortLabel: "Wed", longLabel: "Wednesday" },
    { key: "thu", index: 4, shortLabel: "Thu", longLabel: "Thursday" },
    { key: "fri", index: 5, shortLabel: "Fri", longLabel: "Friday" },
    { key: "sat", index: 6, shortLabel: "Sat", longLabel: "Saturday" },
    { key: "sun", index: 0, shortLabel: "Sun", longLabel: "Sunday" },
  ]
  const DAY_KEYS = DAYS_OF_WEEK.map((day) => day.key)
  const DAY_BY_KEY = DAYS_OF_WEEK.reduce((map, day) => {
    map[day.key] = day
    return map
  }, {})
  const DAY_BY_INDEX = DAYS_OF_WEEK.reduce((map, day) => {
    map[day.index] = day
    return map
  }, {})
  const MAIN_FRAME_RESOURCE_TYPES = ["main_frame"]
  const SUBRESOURCE_TYPES = [
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

  function sanitizeDomain(site) {
    if (typeof site !== "string") {
      return ""
    }

    const trimmed = site.trim().toLowerCase()
    return trimmed.startsWith("www.") ? trimmed.slice(4) : trimmed
  }

  function validateDomainInput(domain) {
    const sanitized = sanitizeDomain(domain)

    if (!sanitized) {
      return false
    }

    const domainRegex =
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

    return (
      domainRegex.test(sanitized) &&
      !sanitized.includes("..") &&
      !sanitized.startsWith(".") &&
      !sanitized.endsWith(".")
    )
  }

  function isTimeFormatValid(time) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time)
  }

  function minutesFromTime(time) {
    const [hours, minutes] = time.split(":").map(Number)
    return hours * 60 + minutes
  }

  function normalizeDaysOfWeek(days, fallbackToAll = true) {
    const values = Array.isArray(days) ? days : []
    const selected = new Set()

    values.forEach((day) => {
      if (typeof day === "string") {
        const normalized = day.trim().toLowerCase()
        if (DAY_BY_KEY[normalized]) {
          selected.add(normalized)
          return
        }

        const fromNumber = DAY_BY_INDEX[Number(normalized)]
        if (fromNumber) {
          selected.add(fromNumber.key)
        }
        return
      }

      if (typeof day === "number" && DAY_BY_INDEX[day]) {
        selected.add(DAY_BY_INDEX[day].key)
      }
    })

    const normalizedDays = DAY_KEYS.filter((key) => selected.has(key))
    if (normalizedDays.length > 0) {
      return normalizedDays
    }

    return fallbackToAll ? [...DAY_KEYS] : []
  }

  function formatDaysOfWeek(days) {
    const normalized = normalizeDaysOfWeek(days)

    if (normalized.length === DAY_KEYS.length) {
      return "Mon, Tue, Wed, Thu, Fri, Sat, Sun"
    }

    return normalized.map((key) => DAY_BY_KEY[key].shortLabel).join(", ")
  }

  function getDayKeyFromDate(date) {
    return DAY_BY_INDEX[date.getDay()].key
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  function buildHostPattern(ruleSite) {
    const site = sanitizeDomain(ruleSite)
    if (!site) {
      return ""
    }

    return `(?:[a-z0-9-]+\\.)*${escapeRegex(site)}`
  }

  function getPreviousDayKey(dayKey) {
    const day = DAY_BY_KEY[dayKey]
    const previousIndex = (day.index + 6) % 7
    return DAY_BY_INDEX[previousIndex].key
  }

  function normalizePattern(pattern) {
    if (typeof pattern !== "string") {
      return ""
    }

    const trimmed = pattern.trim()
    if (!trimmed) {
      return ""
    }

    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  }

  function normalizeComparablePath(path) {
    if (!path || path === "/") {
      return "/"
    }

    return path.endsWith("/") ? path.slice(0, -1) : path
  }

  function getPatternKind(pattern) {
    if (pattern.endsWith("*")) {
      return "prefix"
    }

    return pattern.includes("?") ? "exact-query" : "exact-path"
  }

  function validatePatternInput(pattern) {
    const normalized = normalizePattern(pattern)

    if (!normalized) {
      return {
        valid: false,
        message: "Enter a path like /comments or /wiki/*.",
        normalized,
      }
    }

    if (normalized.indexOf("*") !== -1 && !normalized.endsWith("*")) {
      return {
        valid: false,
        message: "Wildcard * is only supported at the end of a pattern.",
        normalized,
      }
    }

    if (normalized === "*" || normalized === "/*") {
      return {
        valid: false,
        message: "Use a specific path instead of blocking or allowing everything.",
        normalized,
      }
    }

    return {
      valid: true,
      message: "",
      normalized,
      kind: getPatternKind(normalized),
    }
  }

  function uniqueNormalizedPatterns(patterns) {
    const seen = new Set()
    const normalized = []

    for (const pattern of Array.isArray(patterns) ? patterns : []) {
      const result = validatePatternInput(pattern)
      if (!result.valid || seen.has(result.normalized)) {
        continue
      }

      seen.add(result.normalized)
      normalized.push(result.normalized)
    }

    return normalized
  }

  function normalizeRule(rule) {
    const type =
      rule && rule.type === RULE_TYPES.TIMED
        ? RULE_TYPES.TIMED
        : RULE_TYPES.ALWAYS
    const subpageMode = Object.values(SUBPAGE_MODES).includes(rule?.subpageMode)
      ? rule.subpageMode
      : SUBPAGE_MODES.NONE

    return {
      type,
      site: sanitizeDomain(rule?.site),
      startTime:
        type === RULE_TYPES.TIMED && isTimeFormatValid(rule?.startTime || "")
          ? rule.startTime
          : "",
      endTime:
        type === RULE_TYPES.TIMED && isTimeFormatValid(rule?.endTime || "")
          ? rule.endTime
          : "",
      daysOfWeek: normalizeDaysOfWeek(
        rule?.daysOfWeek,
        !Array.isArray(rule?.daysOfWeek)
      ),
      subpageMode,
      subpageWhitelist: uniqueNormalizedPatterns(rule?.subpageWhitelist),
      subpageBlacklist: uniqueNormalizedPatterns(rule?.subpageBlacklist),
    }
  }

  function normalizeRules(rules) {
    if (!Array.isArray(rules)) {
      return []
    }

    const normalized = []
    const seenSites = new Set()

    rules.forEach((rule) => {
      const candidate = normalizeRule(rule)
      if (!candidate.site || seenSites.has(candidate.site)) {
        return
      }

      seenSites.add(candidate.site)
      normalized.push(candidate)
    })

    return normalized
  }

  function validateRuleInput(rule, existingRules, excludeIndex) {
    const normalizedRule = normalizeRule(rule)
    const errors = {}

    if (!validateDomainInput(normalizedRule.site)) {
      errors.site = "Enter a valid domain such as reddit.com."
    }

    if (normalizedRule.type === RULE_TYPES.TIMED) {
      if (!normalizedRule.startTime || !normalizedRule.endTime) {
        errors.schedule = "Choose both a start and end time."
      } else if (normalizedRule.startTime === normalizedRule.endTime) {
        errors.schedule = "Start and end time must be different."
      } else if (normalizedRule.daysOfWeek.length === 0) {
        errors.schedule = "Choose at least one day."
      }
    }

    const patternList =
      normalizedRule.subpageMode === SUBPAGE_MODES.WHITELIST
        ? normalizedRule.subpageWhitelist
        : normalizedRule.subpageMode === SUBPAGE_MODES.BLACKLIST
          ? normalizedRule.subpageBlacklist
          : []

    if (
      normalizedRule.subpageMode !== SUBPAGE_MODES.NONE &&
      patternList.length === 0
    ) {
      errors.subpage = "Add at least one path for the selected subpage strategy."
    }

    const duplicateExists = (existingRules || []).some((existingRule, index) => {
      if (index === excludeIndex) {
        return false
      }

      const candidate = normalizeRule(existingRule)
      return candidate.site === normalizedRule.site
    })

    if (duplicateExists) {
      errors.site = "A rule already exists for this domain."
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      normalizedRule,
    }
  }

  function getRuleTimeWindow(rule) {
    if (
      rule.type !== RULE_TYPES.TIMED ||
      !isTimeFormatValid(rule.startTime) ||
      !isTimeFormatValid(rule.endTime)
    ) {
      return null
    }

    return {
      startMinutes: minutesFromTime(rule.startTime),
      endMinutes: minutesFromTime(rule.endTime),
    }
  }

  function isRuleTimeActive(rule, now) {
    if (rule.type !== RULE_TYPES.TIMED) {
      return true
    }

    const window = getRuleTimeWindow(rule)
    if (!window || window.startMinutes === window.endMinutes) {
      return false
    }

    const reference = now || new Date()
    const current = reference.getHours() * 60 + reference.getMinutes()
    const selectedDays = normalizeDaysOfWeek(rule.daysOfWeek, false)
    if (selectedDays.length === 0) {
      return false
    }
    const todayKey = getDayKeyFromDate(reference)
    const previousDayKey = getPreviousDayKey(todayKey)

    if (window.startMinutes < window.endMinutes) {
      return (
        selectedDays.includes(todayKey) &&
        current >= window.startMinutes &&
        current < window.endMinutes
      )
    }

    return (
      (selectedDays.includes(todayKey) && current >= window.startMinutes) ||
      (selectedDays.includes(previousDayKey) && current < window.endMinutes)
    )
  }

  function getNextAllowedDate(rule, now) {
    if (rule.type !== RULE_TYPES.TIMED || !isRuleTimeActive(rule, now)) {
      return null
    }

    const reference = now || new Date()
    const window = getRuleTimeWindow(rule)
    const nextAllowed = new Date(reference)
    const current = reference.getHours() * 60 + reference.getMinutes()
    const todayKey = getDayKeyFromDate(reference)
    const previousDayKey = getPreviousDayKey(todayKey)
    const selectedDays = normalizeDaysOfWeek(rule.daysOfWeek, false)
    if (selectedDays.length === 0) {
      return null
    }
    const endHours = Number(rule.endTime.slice(0, 2))
    const endMinutes = Number(rule.endTime.slice(3, 5))

    nextAllowed.setSeconds(0, 0)

    if (window.startMinutes < window.endMinutes) {
      nextAllowed.setHours(endHours, endMinutes, 0, 0)
      return nextAllowed
    }

    if (selectedDays.includes(previousDayKey) && current < window.endMinutes) {
      nextAllowed.setHours(endHours, endMinutes, 0, 0)
      return nextAllowed
    }

    nextAllowed.setDate(nextAllowed.getDate() + 1)
    nextAllowed.setHours(endHours, endMinutes, 0, 0)
    return nextAllowed
  }

  function matchesRuleHost(hostname, ruleSite) {
    const normalizedHost = (hostname || "").toLowerCase()
    const normalizedRuleSite = sanitizeDomain(ruleSite)

    if (!normalizedHost || !normalizedRuleSite) {
      return false
    }

    return (
      normalizedHost === normalizedRuleSite ||
      normalizedHost.endsWith(`.${normalizedRuleSite}`)
    )
  }

  function matchUrlPattern(urlString, pattern) {
    const validation = validatePatternInput(pattern)
    if (!validation.valid) {
      return false
    }

    try {
      const parsedUrl = new URL(urlString)
      const pathname = parsedUrl.pathname || "/"
      const pathWithQuery = `${pathname}${parsedUrl.search || ""}`

      if (validation.kind === "prefix") {
        const prefix = validation.normalized.slice(0, -1)
        return prefix.includes("?")
          ? pathWithQuery.startsWith(prefix)
          : pathname.startsWith(prefix)
      }

      if (validation.kind === "exact-query") {
        return pathWithQuery === validation.normalized
      }

      return (
        normalizeComparablePath(pathname) ===
        normalizeComparablePath(validation.normalized)
      )
    } catch (error) {
      return false
    }
  }

  function getSubpageModeLabel(mode) {
    switch (mode) {
      case SUBPAGE_MODES.WHITELIST:
        return "Whitelist"
      case SUBPAGE_MODES.BLACKLIST:
        return "Blacklist"
      default:
        return "Full domain"
    }
  }

  function getRuleTypeLabel(type) {
    return type === RULE_TYPES.TIMED ? "Scheduled" : "Permanent"
  }

  function getRuleSummary(rule) {
    const normalized = normalizeRule(rule)
    const previewPatterns =
      normalized.subpageMode === SUBPAGE_MODES.WHITELIST
        ? normalized.subpageWhitelist
        : normalized.subpageMode === SUBPAGE_MODES.BLACKLIST
          ? normalized.subpageBlacklist
          : []
    const daysLabel = formatDaysOfWeek(normalized.daysOfWeek)

    return {
      typeLabel: getRuleTypeLabel(normalized.type),
      modeLabel: getSubpageModeLabel(normalized.subpageMode),
      scheduleLabel:
        normalized.type === RULE_TYPES.TIMED
          ? `${normalized.startTime}-${normalized.endTime}`
          : "Always active",
      daysLabel: normalized.type === RULE_TYPES.TIMED ? daysLabel : "",
      details:
        normalized.subpageMode === SUBPAGE_MODES.WHITELIST
          ? `${previewPatterns.length} allowed path${previewPatterns.length === 1 ? "" : "s"}`
          : normalized.subpageMode === SUBPAGE_MODES.BLACKLIST
            ? `${previewPatterns.length} blocked path${previewPatterns.length === 1 ? "" : "s"}`
            : "Whole domain",
      previewPatterns: previewPatterns.slice(0, 2),
    }
  }

  function buildBlockedPageQuery(rule, extraParams) {
    const normalized = normalizeRule(rule)
    const params = new URLSearchParams({
      site: normalized.site,
      type: normalized.type,
      mode: normalized.subpageMode,
    })

    if (normalized.startTime) {
      params.set("start", normalized.startTime)
    }

    if (normalized.endTime) {
      params.set("end", normalized.endTime)
    }

    if (normalized.daysOfWeek.length > 0) {
      params.set("days", normalized.daysOfWeek.join(","))
    }

    const extras = extraParams || {}
    Object.keys(extras).forEach((key) => {
      if (extras[key]) {
        params.set(key, extras[key])
      }
    })

    return params.toString()
  }

  function buildBlockedPageUrl(rule, blockedUrl) {
    const extras = blockedUrl ? { blocked: blockedUrl } : undefined
    return `${BLOCKED_PAGE_PATH}#${buildBlockedPageQuery(rule, extras)}`
  }

  function buildHostRegex(ruleSite) {
    return buildHostPattern(ruleSite)
  }

  function buildDomainRegex(ruleSite, captureWholeUrl) {
    const hostRegex = buildHostRegex(ruleSite)
    const core = `https?://${hostRegex}(?:[/?#].*)?`
    return captureWholeUrl ? `^(${core})$` : `^${core}$`
  }

  function buildPatternRegex(ruleSite, pattern, options) {
    const validation = validatePatternInput(pattern)
    if (!validation.valid) {
      return ""
    }

    const hostRegex = buildHostRegex(ruleSite)
    const normalizedPattern = validation.normalized
    const captureWholeUrl = options?.captureWholeUrl === true
    let core = ""

    if (validation.kind === "prefix") {
      const prefix = normalizedPattern.slice(0, -1)
      core = `https?://${hostRegex}${escapeRegex(prefix)}.*(?:#.*)?`
    } else if (validation.kind === "exact-query") {
      core = `https?://${hostRegex}${escapeRegex(normalizedPattern)}(?:#.*)?`
    } else {
      const exactPath = escapeRegex(normalizeComparablePath(normalizedPattern))
      core = `https?://${hostRegex}${exactPath}(?:/)?(?:[?#].*)?`
    }

    return captureWholeUrl ? `^(${core})$` : `^${core}$`
  }

  function createRegexRedirectAction(rule) {
    const metadata = buildBlockedPageQuery(rule)
    return {
      type: "redirect",
      redirect: {
        regexSubstitution: `${BLOCKED_PAGE_PATH}#blocked=\\1&${metadata}`,
      },
    }
  }

  function createBlockAction() {
    return {
      type: "block",
    }
  }

  function createAllowAction() {
    return {
      type: "allow",
    }
  }

  function buildDnrRules(storedRules) {
    const dnrRules = []
    let nextRuleId = 1

    for (const rawRule of normalizeRules(storedRules)) {
      if (!validateDomainInput(rawRule.site) || !isRuleTimeActive(rawRule)) {
        continue
      }

      if (rawRule.subpageMode === SUBPAGE_MODES.NONE) {
        dnrRules.push({
          id: nextRuleId++,
          priority: 1,
          action: createRegexRedirectAction(rawRule),
          condition: {
            regexFilter: buildDomainRegex(rawRule.site, true),
            resourceTypes: MAIN_FRAME_RESOURCE_TYPES,
          },
        })
        dnrRules.push({
          id: nextRuleId++,
          priority: 1,
          action: createBlockAction(),
          condition: {
            regexFilter: buildDomainRegex(rawRule.site, false),
            resourceTypes: SUBRESOURCE_TYPES,
          },
        })
        continue
      }

      if (rawRule.subpageMode === SUBPAGE_MODES.WHITELIST) {
        dnrRules.push({
          id: nextRuleId++,
          priority: 1,
          action: createRegexRedirectAction(rawRule),
          condition: {
            regexFilter: buildDomainRegex(rawRule.site, true),
            resourceTypes: MAIN_FRAME_RESOURCE_TYPES,
          },
        })

        for (const pattern of rawRule.subpageWhitelist) {
          const regexFilter = buildPatternRegex(rawRule.site, pattern)
          if (!regexFilter) {
            continue
          }

          dnrRules.push({
            id: nextRuleId++,
            priority: 2,
            action: createAllowAction(),
            condition: {
              regexFilter,
              resourceTypes: MAIN_FRAME_RESOURCE_TYPES,
            },
          })
        }
        continue
      }

      if (rawRule.subpageMode === SUBPAGE_MODES.BLACKLIST) {
        for (const pattern of rawRule.subpageBlacklist) {
          const regexFilter = buildPatternRegex(rawRule.site, pattern, {
            captureWholeUrl: true,
          })
          if (!regexFilter) {
            continue
          }

          dnrRules.push({
            id: nextRuleId++,
            priority: 2,
            action: createRegexRedirectAction(rawRule),
            condition: {
              regexFilter,
              resourceTypes: MAIN_FRAME_RESOURCE_TYPES,
            },
          })
          dnrRules.push({
            id: nextRuleId++,
            priority: 2,
            action: createBlockAction(),
            condition: {
              regexFilter,
              resourceTypes: SUBRESOURCE_TYPES,
            },
          })
        }
      }
    }

    return dnrRules
  }

  function getActiveBlockingRuleForUrl(urlString, rules, now) {
    try {
      const parsedUrl = new URL(urlString)
      const normalizedRules = normalizeRules(rules)

      for (const rule of normalizedRules) {
        if (
          !validateDomainInput(rule.site) ||
          !matchesRuleHost(parsedUrl.hostname, rule.site) ||
          !isRuleTimeActive(rule, now)
        ) {
          continue
        }

        if (rule.subpageMode === SUBPAGE_MODES.NONE) {
          return { shouldBlock: true, matchingRule: rule }
        }

        if (rule.subpageMode === SUBPAGE_MODES.WHITELIST) {
          const isAllowed = rule.subpageWhitelist.some((pattern) =>
            matchUrlPattern(urlString, pattern)
          )

          if (!isAllowed) {
            return { shouldBlock: true, matchingRule: rule }
          }

          continue
        }

        if (
          rule.subpageMode === SUBPAGE_MODES.BLACKLIST &&
          rule.subpageBlacklist.some((pattern) => matchUrlPattern(urlString, pattern))
        ) {
          return { shouldBlock: true, matchingRule: rule }
        }
      }
    } catch (error) {
      return { shouldBlock: false }
    }

    return { shouldBlock: false }
  }

  return {
    BLOCKED_PAGE_PATH,
    RULES_STORAGE_KEY,
    RULE_TYPES,
    SUBPAGE_MODES,
    DAYS_OF_WEEK,
    DAY_KEYS,
    MAIN_FRAME_RESOURCE_TYPES,
    SUBRESOURCE_TYPES,
    sanitizeDomain,
    validateDomainInput,
    isTimeFormatValid,
    normalizeDaysOfWeek,
    formatDaysOfWeek,
    normalizePattern,
    validatePatternInput,
    normalizeRule,
    normalizeRules,
    validateRuleInput,
    isRuleTimeActive,
    getNextAllowedDate,
    matchesRuleHost,
    matchUrlPattern,
    getRuleSummary,
    getSubpageModeLabel,
    getRuleTypeLabel,
    buildBlockedPageQuery,
    buildBlockedPageUrl,
    buildDomainRegex,
    buildPatternRegex,
    buildDnrRules,
    getActiveBlockingRuleForUrl,
  }
})
