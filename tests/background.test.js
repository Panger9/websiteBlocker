const assert = require("assert")
const background = require("../js/background.js")
const rules = require("../js/rule-engine.js")
const stats = require("../js/stats.js")

async function test(name, fn) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error.stack)
    process.exitCode = 1
  }
}

function createChromeStub(initialStatistics = stats.createEmptyStatistics()) {
  const storageState = {
    [stats.STATS_STORAGE_KEY]: initialStatistics,
  }
  const redirectedTabs = []

  return {
    storageState,
    redirectedTabs,
    chromeApi: {
      storage: {
        local: {
          async get(keys) {
            const result = {}
            keys.forEach((key) => {
              result[key] = storageState[key]
            })
            return result
          },
          async set(payload) {
            Object.assign(storageState, payload)
          },
        },
      },
      tabs: {
        onUpdated: {
          addListener() {},
        },
        async update(tabId, payload) {
          redirectedTabs.push({ tabId, payload })
        },
      },
      runtime: {
        getURL(path) {
          return `chrome-extension://test-extension/${path}`
        },
        onMessage: {
          addListener() {},
        },
        openOptionsPage() {},
      },
      declarativeNetRequest: {
        async getDynamicRules() {
          return []
        },
        async updateDynamicRules() {},
      },
      alarms: {
        onAlarm: {
          addListener() {},
        },
        get(name, callback) {
          callback(null)
        },
        create() {},
      },
      webNavigation: {
        onHistoryStateUpdated: {
          addListener() {},
        },
      },
      action: {
        onClicked: {
          addListener() {},
        },
      },
    },
  }
}

async function main() {
  await test("processes URL updates even when tab status is not present", async () => {
    assert.strictEqual(
      background.shouldHandleTabUrlUpdate({ url: "https://www.reddit.com/" }),
      true
    )
    assert.strictEqual(background.shouldHandleTabUrlUpdate({}), false)
  })

  await test("ignores extension-owned URLs in navigation listeners", async () => {
    const { chromeApi } = createChromeStub()

    assert.strictEqual(
      background.isExtensionPageUrl(
        chromeApi,
        "chrome-extension://test-extension/html/blocked.html"
      ),
      true
    )
    assert.strictEqual(
      background.isExtensionPageUrl(chromeApi, "https://www.reddit.com/"),
      false
    )
  })

  await test("counts a blocked navigation and redirects the tab", async () => {
    const { chromeApi, storageState, redirectedTabs } = createChromeStub()
    const controller = background.createServiceWorkerController({
      chromeApi,
      rulesApi: rules,
      statsApi: stats,
    })
    controller.setCurrentRules([
      {
        type: "always",
        site: "reddit.com",
        subpageMode: "none",
      },
    ])

    const blocked = await controller.checkAndBlockIfNecessary(
      4,
      "https://old.reddit.com/r/javascript",
      1000
    )

    assert.strictEqual(blocked, true)
    assert.strictEqual(storageState[stats.STATS_STORAGE_KEY].totalBlockedNavigations, 1)
    assert.strictEqual(storageState[stats.STATS_STORAGE_KEY].domains["reddit.com"].count, 1)
    assert.strictEqual(redirectedTabs.length, 1)
  })

  await test("counts DNR-matched main-frame navigations", async () => {
    const { chromeApi, storageState } = createChromeStub()
    const controller = background.createServiceWorkerController({
      chromeApi,
      rulesApi: rules,
      statsApi: stats,
    })
    controller.setCurrentRules([
      {
        type: "always",
        site: "reddit.com",
        subpageMode: "none",
      },
    ])

    const counted = await controller.recordMatchedNavigation({
      request: {
        tabId: 6,
        url: "https://www.reddit.com/r/javascript",
        type: "main_frame",
      },
    }, 1000)

    assert.strictEqual(counted, true)
    assert.strictEqual(storageState[stats.STATS_STORAGE_KEY].totalBlockedNavigations, 1)
    assert.strictEqual(storageState[stats.STATS_STORAGE_KEY].domains["reddit.com"].count, 1)
  })

  await test("deduplicates duplicate blocked events for the same tab and URL", async () => {
    const { chromeApi, storageState, redirectedTabs } = createChromeStub()
    const controller = background.createServiceWorkerController({
      chromeApi,
      rulesApi: rules,
      statsApi: stats,
    })
    controller.setCurrentRules([
      {
        type: "always",
        site: "youtube.com",
        subpageMode: "blacklist",
        subpageBlacklist: ["/shorts/*"],
      },
    ])

    await controller.checkAndBlockIfNecessary(2, "https://m.youtube.com/shorts/123", 1000)
    await controller.checkAndBlockIfNecessary(2, "https://m.youtube.com/shorts/123", 2500)

    assert.strictEqual(storageState[stats.STATS_STORAGE_KEY].totalBlockedNavigations, 1)
    assert.strictEqual(storageState[stats.STATS_STORAGE_KEY].domains["youtube.com"].count, 1)
    assert.strictEqual(redirectedTabs.length, 2)
  })

  await test("counts the same blocked URL again after the dedupe window expires", async () => {
    const { chromeApi, storageState } = createChromeStub()
    const controller = background.createServiceWorkerController({
      chromeApi,
      rulesApi: rules,
      statsApi: stats,
    })
    controller.setCurrentRules([
      {
        type: "always",
        site: "youtube.com",
        subpageMode: "blacklist",
        subpageBlacklist: ["/shorts/*"],
      },
    ])

    await controller.checkAndBlockIfNecessary(2, "https://m.youtube.com/shorts/123", 1000)
    await controller.checkAndBlockIfNecessary(2, "https://m.youtube.com/shorts/123", 3001)

    assert.strictEqual(storageState[stats.STATS_STORAGE_KEY].totalBlockedNavigations, 2)
    assert.strictEqual(storageState[stats.STATS_STORAGE_KEY].domains["youtube.com"].count, 2)
  })

  await test("does not count or redirect allowed navigations", async () => {
    const { chromeApi, storageState, redirectedTabs } = createChromeStub()
    const controller = background.createServiceWorkerController({
      chromeApi,
      rulesApi: rules,
      statsApi: stats,
    })
    controller.setCurrentRules([
      {
        type: "always",
        site: "reddit.com",
        subpageMode: "whitelist",
        subpageWhitelist: ["/comments"],
      },
    ])

    const blocked = await controller.checkAndBlockIfNecessary(
      1,
      "https://reddit.com/comments",
      1000
    )

    assert.strictEqual(blocked, false)
    assert.deepStrictEqual(storageState[stats.STATS_STORAGE_KEY], {
      totalBlockedNavigations: 0,
      domains: {},
    })
    assert.strictEqual(redirectedTabs.length, 0)
  })

  if (!process.exitCode) {
    console.log("All background tests passed.")
  }
}

main().catch((error) => {
  console.error(error.stack)
  process.exitCode = 1
})
