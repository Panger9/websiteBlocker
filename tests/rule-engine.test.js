const assert = require("assert")
const rules = require("../js/rule-engine.js")

function dateAt(isoDate, hours, minutes) {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setHours(hours, minutes, 0, 0)
  return date
}

function matchesRegexFilter(regexFilter, url) {
  return new RegExp(regexFilter).test(url)
}

function test(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error.stack)
    process.exitCode = 1
  }
}

test("sanitizes and validates domains", () => {
  assert.strictEqual(rules.sanitizeDomain(" WWW.Reddit.com "), "reddit.com")
  assert.strictEqual(rules.validateDomainInput("reddit.com"), true)
  assert.strictEqual(rules.validateDomainInput("http://reddit.com"), false)
})

test("normalizes patterns and rejects unsafe wildcards", () => {
  assert.deepStrictEqual(rules.validatePatternInput("comments").normalized, "/comments")
  assert.strictEqual(rules.validatePatternInput("/wiki/*").valid, true)
  assert.strictEqual(rules.validatePatternInput("/wi*ki").valid, false)
})

test("matches exact paths precisely while tolerating trailing slashes", () => {
  assert.strictEqual(
    rules.matchUrlPattern("https://reddit.com/comments", "/comments"),
    true
  )
  assert.strictEqual(
    rules.matchUrlPattern("https://reddit.com/comments/", "/comments"),
    true
  )
  assert.strictEqual(
    rules.matchUrlPattern("https://reddit.com/comments?sort=top", "/comments"),
    true
  )
  assert.strictEqual(
    rules.matchUrlPattern("https://reddit.com/bestcomments", "/comments"),
    false
  )
  assert.strictEqual(
    rules.matchUrlPattern("https://reddit.com/foo/comments-bar", "/comments"),
    false
  )
})

test("matches prefixes only when intended", () => {
  assert.strictEqual(
    rules.matchUrlPattern("https://reddit.com/wiki/guides", "/wiki/*"),
    true
  )
  assert.strictEqual(
    rules.matchUrlPattern("https://reddit.com/wikipedia", "/wiki/*"),
    false
  )
})

test("supports exact query matching", () => {
  assert.strictEqual(
    rules.matchUrlPattern("https://reddit.com/?feed=home", "/?feed=home"),
    true
  )
  assert.strictEqual(
    rules.matchUrlPattern("https://reddit.com/?feed=popular", "/?feed=home"),
    false
  )
})

test("normalizes weekday schedules", () => {
  const normalized = rules.normalizeRule({
    type: "timed",
    site: "youtube.com",
    startTime: "09:00",
    endTime: "17:00",
    daysOfWeek: ["fri", "mon", "wed", "mon", "0"],
  })

  assert.deepStrictEqual(normalized.daysOfWeek, ["mon", "wed", "fri", "sun"])
  assert.strictEqual(rules.formatDaysOfWeek(["mon", "wed", "fri"]), "Mon, Wed, Fri")
})

test("keeps only one normalized rule per site", () => {
  const normalized = rules.normalizeRules([
    { type: "always", site: "youtube.com", subpageMode: "none" },
    { type: "timed", site: "youtube.com", startTime: "09:00", endTime: "17:00" },
    { type: "always", site: "reddit.com", subpageMode: "none" },
  ])

  assert.strictEqual(normalized.length, 2)
  assert.strictEqual(normalized[0].site, "youtube.com")
  assert.strictEqual(normalized[1].site, "reddit.com")
})

test("matches domain rules on subdomains but not lookalike hosts", () => {
  assert.strictEqual(rules.matchesRuleHost("reddit.com", "reddit.com"), true)
  assert.strictEqual(rules.matchesRuleHost("www.reddit.com", "reddit.com"), true)
  assert.strictEqual(rules.matchesRuleHost("old.reddit.com", "reddit.com"), true)
  assert.strictEqual(rules.matchesRuleHost("deep.old.reddit.com", "reddit.com"), true)
  assert.strictEqual(rules.matchesRuleHost("notreddit.com", "reddit.com"), false)
  assert.strictEqual(rules.matchesRuleHost("fake-reddit.com", "reddit.com"), false)
})

test("handles timed weekday rules", () => {
  const weekdayRule = rules.normalizeRule({
    type: "timed",
    site: "youtube.com",
    startTime: "09:00",
    endTime: "17:00",
    daysOfWeek: ["mon", "tue", "wed", "thu", "fri"],
  })

  assert.strictEqual(rules.isRuleTimeActive(weekdayRule, dateAt("2026-03-16", 10, 30)), true)
  assert.strictEqual(rules.isRuleTimeActive(weekdayRule, dateAt("2026-03-16", 18, 0)), false)
  assert.strictEqual(rules.isRuleTimeActive(weekdayRule, dateAt("2026-03-15", 10, 30)), false)
})

test("handles overnight weekday rules across the next morning", () => {
  const overnightRule = rules.normalizeRule({
    type: "timed",
    site: "youtube.com",
    startTime: "22:00",
    endTime: "07:00",
    daysOfWeek: ["mon", "tue", "wed", "thu", "fri"],
  })

  assert.strictEqual(rules.isRuleTimeActive(overnightRule, dateAt("2026-03-16", 23, 15)), true)
  assert.strictEqual(rules.isRuleTimeActive(overnightRule, dateAt("2026-03-17", 6, 45)), true)
  assert.strictEqual(rules.isRuleTimeActive(overnightRule, dateAt("2026-03-21", 6, 45)), true)
  assert.strictEqual(rules.isRuleTimeActive(overnightRule, dateAt("2026-03-21", 23, 15)), false)
})

test("computes the next allowed date for timed rules", () => {
  const dayRule = rules.normalizeRule({
    type: "timed",
    site: "youtube.com",
    startTime: "09:00",
    endTime: "17:00",
    daysOfWeek: ["mon", "tue", "wed", "thu", "fri"],
  })
  const overnightRule = rules.normalizeRule({
    type: "timed",
    site: "youtube.com",
    startTime: "22:00",
    endTime: "07:00",
    daysOfWeek: ["mon", "tue", "wed", "thu", "fri"],
  })

  const sameDayEnd = rules.getNextAllowedDate(dayRule, dateAt("2026-03-16", 10, 30))
  const overnightEnd = rules.getNextAllowedDate(overnightRule, dateAt("2026-03-16", 23, 30))
  const carryEnd = rules.getNextAllowedDate(overnightRule, dateAt("2026-03-17", 6, 30))

  assert.strictEqual(sameDayEnd.toISOString(), new Date("2026-03-16T17:00:00").toISOString())
  assert.strictEqual(overnightEnd.toISOString(), new Date("2026-03-17T07:00:00").toISOString())
  assert.strictEqual(carryEnd.toISOString(), new Date("2026-03-17T07:00:00").toISOString())
})

test("detects active blocking rules consistently", () => {
  const active = rules.getActiveBlockingRuleForUrl(
    "https://reddit.com/r/javascript",
    [
      {
        type: "always",
        site: "reddit.com",
        subpageMode: "whitelist",
        subpageWhitelist: ["/comments", "/wiki/*"],
      },
    ]
  )
  const allowed = rules.getActiveBlockingRuleForUrl("https://reddit.com/comments/", [
    {
      type: "always",
      site: "reddit.com",
      subpageMode: "whitelist",
      subpageWhitelist: ["/comments", "/wiki/*"],
    },
  ])

  assert.strictEqual(active.shouldBlock, true)
  assert.strictEqual(allowed.shouldBlock, false)
})

test("applies full-domain rules to subdomains", () => {
  const blocked = rules.getActiveBlockingRuleForUrl("https://old.reddit.com/r/javascript", [
    {
      type: "always",
      site: "reddit.com",
      subpageMode: "none",
    },
  ])

  assert.strictEqual(blocked.shouldBlock, true)
})

test("respects whitelist and blacklist patterns on subdomains", () => {
  const whitelistAllowed = rules.getActiveBlockingRuleForUrl(
    "https://m.youtube.com/watch?v=abc",
    [
      {
        type: "always",
        site: "youtube.com",
        subpageMode: "whitelist",
        subpageWhitelist: ["/watch?v=abc"],
      },
    ]
  )
  const whitelistBlocked = rules.getActiveBlockingRuleForUrl(
    "https://m.youtube.com/shorts/123",
    [
      {
        type: "always",
        site: "youtube.com",
        subpageMode: "whitelist",
        subpageWhitelist: ["/watch?v=abc"],
      },
    ]
  )
  const blacklistBlocked = rules.getActiveBlockingRuleForUrl(
    "https://m.youtube.com/shorts/123",
    [
      {
        type: "always",
        site: "youtube.com",
        subpageMode: "blacklist",
        subpageBlacklist: ["/shorts/*"],
      },
    ]
  )

  assert.strictEqual(whitelistAllowed.shouldBlock, false)
  assert.strictEqual(whitelistBlocked.shouldBlock, true)
  assert.strictEqual(blacklistBlocked.shouldBlock, true)
})

test("builds DNR rules with allow overrides for whitelist mode", () => {
  const dnrRules = rules.buildDnrRules([
    {
      type: "always",
      site: "reddit.com",
      subpageMode: "whitelist",
      subpageWhitelist: ["/comments", "/wiki/*"],
    },
  ])

  assert.strictEqual(dnrRules.length, 3)
  assert.strictEqual(dnrRules[0].action.type, "redirect")
  assert.strictEqual(dnrRules[1].action.type, "allow")
  assert.ok(dnrRules[1].condition.regexFilter.includes("/comments"))
})

test("builds regex-based full-domain rules that also cover subdomains", () => {
  const dnrRules = rules.buildDnrRules([
    {
      type: "always",
      site: "reddit.com",
      subpageMode: "none",
    },
  ])

  assert.strictEqual(dnrRules.length, 2)
  assert.strictEqual(
    matchesRegexFilter(dnrRules[0].condition.regexFilter, "https://old.reddit.com/r/javascript"),
    true
  )
  assert.strictEqual(
    matchesRegexFilter(dnrRules[1].condition.regexFilter, "https://old.reddit.com/api/test"),
    true
  )
  assert.strictEqual(
    matchesRegexFilter(dnrRules[1].condition.regexFilter, "https://notreddit.com/api/test"),
    false
  )
})

test("creates human-readable summaries for scheduled path rules", () => {
  const summary = rules.getRuleSummary({
    type: "timed",
    site: "youtube.com",
    startTime: "09:00",
    endTime: "17:00",
    daysOfWeek: ["mon", "tue", "wed", "thu", "fri"],
    subpageMode: "blacklist",
    subpageBlacklist: ["/shorts", "/feed"],
  })

  assert.deepStrictEqual(summary, {
    typeLabel: "Scheduled",
    modeLabel: "Blacklist",
    scheduleLabel: "09:00-17:00",
    daysLabel: "Mon, Tue, Wed, Thu, Fri",
    details: "2 blocked paths",
    previewPatterns: ["/shorts", "/feed"],
  })
})

test("builds blocked page URLs with rule metadata", () => {
  const blockedUrl = rules.buildBlockedPageUrl(
    {
      type: "timed",
      site: "youtube.com",
      startTime: "09:00",
      endTime: "17:00",
      daysOfWeek: ["mon", "tue"],
      subpageMode: "blacklist",
      subpageBlacklist: ["/shorts"],
    },
    "https://m.youtube.com/shorts/123"
  )

  assert.ok(blockedUrl.startsWith("/html/blocked.html#"))
  assert.ok(blockedUrl.includes("site=youtube.com"))
  assert.ok(blockedUrl.includes("type=timed"))
  assert.ok(blockedUrl.includes("mode=blacklist"))
  assert.ok(blockedUrl.includes("days=mon%2Ctue"))
  assert.ok(blockedUrl.includes("blocked=https%3A%2F%2Fm.youtube.com%2Fshorts%2F123"))
})

test("rejects a second rule for the same site", () => {
  const validation = rules.validateRuleInput(
    {
      type: "timed",
      site: "youtube.com",
      startTime: "09:00",
      endTime: "17:00",
      daysOfWeek: ["mon", "tue", "wed", "thu", "fri"],
      subpageMode: "blacklist",
      subpageBlacklist: ["/shorts"],
    },
    [
      {
        type: "always",
        site: "youtube.com",
        subpageMode: "none",
      },
    ]
  )

  assert.strictEqual(validation.valid, false)
  assert.strictEqual(validation.errors.site, "A rule already exists for this domain.")
})

if (!process.exitCode) {
  console.log("All rule-engine tests passed.")
}
