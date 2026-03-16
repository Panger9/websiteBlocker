(function (root, factory) {
  const api = factory()

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api
  }

  root.SiteBlockerRules = api
})(typeof globalThis !== "undefined" ? globalThis : self, function () {
  const BLOCKED_PAGE_PATH = "/html/blocked.html"
  const RULE_TYPES = {
    ALWAYS: "always",
    TIMED: "timed",
  }
  const SUBPAGE_MODES = {
    NONE: "none",
    WHITELIST: "whitelist",
    BLACKLIST: "blacklist",
  }
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
      subpageMode,
      subpageWhitelist: uniqueNormalizedPatterns(rule?.subpageWhitelist),
      subpageBlacklist: uniqueNormalizedPatterns(rule?.subpageBlacklist),
    }
  }

  function normalizeRules(rules) {
    return Array.isArray(rules) ? rules.map(normalizeRule) : []
  }

  function createRuleKey(rule) {
    const normalized = normalizeRule(rule)
    return [
      normalized.type,
      normalized.site,
      normalized.startTime,
      normalized.endTime,
      normalized.subpageMode,
      normalized.subpageWhitelist.join(","),
      normalized.subpageBlacklist.join(","),
    ].join("|")
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
      return (
        candidate.type === normalizedRule.type &&
        candidate.site === normalizedRule.site &&
        candidate.startTime === normalizedRule.startTime &&
        candidate.endTime === normalizedRule.endTime
      )
    })

    if (duplicateExists) {
      errors.site = "An identical rule already exists."
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

    if (window.startMinutes < window.endMinutes) {
      return current >= window.startMinutes && current < window.endMinutes
    }

    return current >= window.startMinutes || current < window.endMinutes
  }

  function getNextAllowedDate(rule, now) {
    if (rule.type !== RULE_TYPES.TIMED || !isRuleTimeActive(rule, now)) {
      return null
    }

    const reference = now || new Date()
    const window = getRuleTimeWindow(rule)
    const nextAllowed = new Date(reference)
    const current = reference.getHours() * 60 + reference.getMinutes()
    const endHours = Number(rule.endTime.slice(0, 2))
    const endMinutes = Number(rule.endTime.slice(3, 5))

    nextAllowed.setSeconds(0, 0)

    if (window.startMinutes < window.endMinutes || current < window.endMinutes) {
      nextAllowed.setHours(endHours, endMinutes, 0, 0)
      return nextAllowed
    }

    nextAllowed.setDate(nextAllowed.getDate() + 1)
    nextAllowed.setHours(endHours, endMinutes, 0, 0)
    return nextAllowed
  }

  function getRuleHosts(ruleSite) {
    const site = sanitizeDomain(ruleSite)
    return site ? [site, `www.${site}`] : []
  }

  function matchesRuleHost(hostname, ruleSite) {
    const normalizedHost = (hostname || "").toLowerCase()
    return getRuleHosts(ruleSite).includes(normalizedHost)
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
    return type === RULE_TYPES.TIMED ? "Scheduled" : "Always"
  }

  function getRuleSummary(rule) {
    const normalized = normalizeRule(rule)
    const previewPatterns =
      normalized.subpageMode === SUBPAGE_MODES.WHITELIST
        ? normalized.subpageWhitelist
        : normalized.subpageMode === SUBPAGE_MODES.BLACKLIST
          ? normalized.subpageBlacklist
          : []

    return {
      typeLabel: getRuleTypeLabel(normalized.type),
      modeLabel: getSubpageModeLabel(normalized.subpageMode),
      scheduleLabel:
        normalized.type === RULE_TYPES.TIMED
          ? `${normalized.startTime} to ${normalized.endTime}`
          : "All day",
      details:
        normalized.subpageMode === SUBPAGE_MODES.WHITELIST
          ? `${previewPatterns.length} allowed path${previewPatterns.length === 1 ? "" : "s"}`
          : normalized.subpageMode === SUBPAGE_MODES.BLACKLIST
            ? `${previewPatterns.length} blocked path${previewPatterns.length === 1 ? "" : "s"}`
            : "Entire domain blocked",
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

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  function buildHostRegex(ruleSite) {
    return `(?:${getRuleHosts(ruleSite).map(escapeRegex).join("|")})`
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

  function getBlockCondition(rule) {
    return {
      requestDomains: getRuleHosts(rule.site),
      resourceTypes: SUBRESOURCE_TYPES,
    }
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
          condition: getBlockCondition(rawRule),
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
    RULE_TYPES,
    SUBPAGE_MODES,
    MAIN_FRAME_RESOURCE_TYPES,
    SUBRESOURCE_TYPES,
    sanitizeDomain,
    validateDomainInput,
    isTimeFormatValid,
    normalizePattern,
    validatePatternInput,
    normalizeRule,
    normalizeRules,
    createRuleKey,
    validateRuleInput,
    isRuleTimeActive,
    getNextAllowedDate,
    getRuleHosts,
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
