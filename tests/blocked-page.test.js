const assert = require("assert")
const blockedPage = require("../js/blocked-page.js")

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

test("reads blocked URL from params and decodes it", () => {
  const params = new URLSearchParams("blocked=https%3A%2F%2Fm.youtube.com%2Fshorts%2F123")

  assert.strictEqual(
    blockedPage.readBlockedUrl(params),
    "https://m.youtube.com/shorts/123"
  )
})

test("builds fallback summary when no site metadata exists", () => {
  const params = new URLSearchParams("")

  assert.strictEqual(
    blockedPage.buildStaticSummary(params),
    "This page was blocked by your current Yet Another Site Blocker rule."
  )
})

test("builds whitelist and blacklist summaries", () => {
  assert.strictEqual(
    blockedPage.buildActiveRuleSummary({
      type: "timed",
      site: "youtube.com",
      subpageMode: "blacklist",
    }),
    "Scheduled rule for youtube.com. The site stays open by default, but listed paths are blocked."
  )

  assert.strictEqual(
    blockedPage.buildActiveRuleSummary({
      type: "always",
      site: "reddit.com",
      subpageMode: "whitelist",
    }),
    "Permanent rule for reddit.com. The site is blocked by default, but listed paths stay open."
  )
})

test("formats same-day and future availability text", () => {
  const now = new Date("2026-03-20T10:00:00")
  const sameDay = new Date("2026-03-20T17:30:00")
  const nextDay = new Date("2026-03-21T07:15:00")

  assert.strictEqual(
    blockedPage.formatAvailability(sameDay, now),
    `today at ${sameDay.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  )
  assert.strictEqual(
    blockedPage.formatAvailability(nextDay, now),
    `on ${nextDay.toLocaleDateString([], { month: "short", day: "numeric" })} at ${nextDay.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`
  )
})

if (!process.exitCode) {
  console.log("All blocked-page tests passed.")
}
