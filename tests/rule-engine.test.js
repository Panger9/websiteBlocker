const assert = require("assert")
const rules = require("../js/rule-engine.js")

function dateAt(hours, minutes) {
  const date = new Date("2026-03-14T00:00:00")
  date.setHours(hours, minutes, 0, 0)
  return date
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

test("handles scheduled rules including overnight windows", () => {
  const dayRule = rules.normalizeRule({
    type: "timed",
    site: "youtube.com",
    startTime: "09:00",
    endTime: "17:00",
  })
  const overnightRule = rules.normalizeRule({
    type: "timed",
    site: "youtube.com",
    startTime: "22:00",
    endTime: "07:00",
  })

  assert.strictEqual(rules.isRuleTimeActive(dayRule, dateAt(10, 30)), true)
  assert.strictEqual(rules.isRuleTimeActive(dayRule, dateAt(18, 0)), false)
  assert.strictEqual(rules.isRuleTimeActive(overnightRule, dateAt(23, 15)), true)
  assert.strictEqual(rules.isRuleTimeActive(overnightRule, dateAt(6, 45)), true)
  assert.strictEqual(rules.isRuleTimeActive(overnightRule, dateAt(12, 0)), false)
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

if (!process.exitCode) {
  console.log("All rule-engine tests passed.")
}
