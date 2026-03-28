const assert = require("assert")
const stats = require("../js/stats.js")

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

test("normalizes invalid statistics payloads", () => {
  const normalized = stats.normalizeStatistics({
    totalBlockedNavigations: -2,
    domains: {
      " WWW.Reddit.com ": { count: 3.9 },
      "": { count: 7 },
      "youtube.com": { count: 0 },
    },
  })

  assert.deepStrictEqual(normalized, {
    totalBlockedNavigations: 3,
    domains: {
      "reddit.com": { count: 3 },
    },
  })
})

test("records first and repeated blocked navigations per domain", () => {
  const once = stats.recordBlockedNavigation(null, "https://m.youtube.com/shorts/123", "youtube.com")
  const twice = stats.recordBlockedNavigation(once, "https://m.youtube.com/shorts/456", "youtube.com")

  assert.strictEqual(once.totalBlockedNavigations, 1)
  assert.strictEqual(once.domains["youtube.com"].count, 1)
  assert.strictEqual(twice.totalBlockedNavigations, 2)
  assert.strictEqual(twice.domains["youtube.com"].count, 2)
})

test("falls back to the URL hostname when no rule site is provided", () => {
  const recorded = stats.recordBlockedNavigation(
    stats.createEmptyStatistics(),
    "https://www.reddit.com/r/javascript",
    ""
  )

  assert.deepStrictEqual(recorded, {
    totalBlockedNavigations: 1,
    domains: {
      "reddit.com": { count: 1 },
    },
  })
})

test("resets statistics to an empty state", () => {
  assert.deepStrictEqual(stats.resetStatistics(), {
    totalBlockedNavigations: 0,
    domains: {},
  })
})

test("builds sorted domain rows and summary values for the options UI", () => {
  const statistics = stats.normalizeStatistics({
    totalBlockedNavigations: 8,
    domains: {
      "reddit.com": { count: 2 },
      "youtube.com": { count: 5 },
      "archive.org": { count: 1 },
    },
  })

  assert.deepStrictEqual(stats.getStatisticsSummary(statistics), {
    totalBlockedNavigations: 8,
    blockedDomainsCount: 3,
  })
  assert.deepStrictEqual(stats.getSortedDomainStats(statistics), [
    { site: "youtube.com", count: 5 },
    { site: "reddit.com", count: 2 },
    { site: "archive.org", count: 1 },
  ])
})

test("deduplicates the same tab and URL within the configured window", () => {
  const deduper = stats.createNavigationDeduper(2000)

  assert.strictEqual(
    deduper.shouldCountNavigation(7, "https://reddit.com/r/javascript", 1000),
    true
  )
  assert.strictEqual(
    deduper.shouldCountNavigation(7, "https://reddit.com/r/javascript", 2500),
    false
  )
  assert.strictEqual(
    deduper.shouldCountNavigation(7, "https://reddit.com/r/javascript", 3001),
    true
  )
})

if (!process.exitCode) {
  console.log("All stats tests passed.")
}
