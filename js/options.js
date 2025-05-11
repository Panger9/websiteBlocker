// js/options.js

document.addEventListener("DOMContentLoaded", () => {
  // Input fields and buttons
  const alwaysBlockInput = document.getElementById("alwaysBlockInput")
  const addAlwaysBlockButton = document.getElementById("addAlwaysBlock") // Text from HTML
  const alwaysBlockListUI = document.getElementById("alwaysBlockList")

  const timedBlockInput = document.getElementById("timedBlockInput")
  const startTimeInput = document.getElementById("startTime")
  const endTimeInput = document.getElementById("endTime")
  const addTimedBlockButton = document.getElementById("addTimedBlock") // Text from HTML
  const timedBlockListUI = document.getElementById("timedBlockList")

  // Subpage section elements
  const subpageRulesEditSection = document.getElementById(
    "subpage-rules-edit-section"
  )
  const editingDomainNameSpan = document.getElementById("editingDomainName")
  const subpageModeRadios = document.querySelectorAll(
    'input[name="subpageMode"]'
  )
  const subpageWhitelistExplanation = document.getElementById(
    "subpage-whitelist-explanation"
  )
  const subpageBlacklistExplanation = document.getElementById(
    "subpage-blacklist-explanation"
  )
  const subpageWhitelistManagementDiv = document.getElementById(
    "subpage-whitelist-management"
  )
  const subpageBlacklistManagementDiv = document.getElementById(
    "subpage-blacklist-management"
  )
  const subpageWhitelistInput = document.getElementById("subpageWhitelistInput")
  const addSubpageWhitelistButton = document.getElementById(
    "addSubpageWhitelist"
  )
  const subpageWhitelistUI = document.getElementById("subpageWhitelistUI")
  const subpageBlacklistInput = document.getElementById("subpageBlacklistInput")
  const addSubpageBlacklistButton = document.getElementById(
    "addSubpageBlacklist"
  )
  const subpageBlacklistUI = document.getElementById("subpageBlacklistUI")
  const editingMainUrlDisplays = document.querySelectorAll(
    ".editing-main-url-display"
  )

  const globalEditButtonContainer = document.getElementById("timedBlockButtons")

  let saveChangesButton
  let cancelEditButton

  let rules = []
  let editState = {
    index: -1,
    type: "",
    originalRule: null,
    subpageMode: "none",
    subpageWhitelist: [],
    subpageBlacklist: [],
  }

  createGlobalEditButtons()
  loadRulesAndRender()

  function createGlobalEditButtons() {
    saveChangesButton = document.createElement("button")
    saveChangesButton.textContent = "Save Changes" // Icon: ✓ or 💾
    saveChangesButton.id = "saveChangesButton"
    saveChangesButton.style.display = "none"
    saveChangesButton.addEventListener("click", handleSaveChanges)

    cancelEditButton = document.createElement("button")
    cancelEditButton.textContent = "Cancel" // Icon: ✗
    cancelEditButton.id = "cancelEditButton"
    cancelEditButton.style.display = "none"
    cancelEditButton.addEventListener("click", handleCancelEdit)

    if (globalEditButtonContainer) {
      globalEditButtonContainer.appendChild(saveChangesButton)
      globalEditButtonContainer.appendChild(cancelEditButton)
    } else {
      console.warn(
        "Timed block button container not found for global edit buttons."
      )
    }
  }

  addAlwaysBlockButton.addEventListener("click", () => {
    if (editState.index !== -1) return
    const site = alwaysBlockInput.value.trim().toLowerCase()
    if (
      validateAndAddRule({
        type: "always",
        site,
        subpageMode: "none",
        subpageWhitelist: [],
        subpageBlacklist: [],
      })
    ) {
      alwaysBlockInput.value = ""
    }
  })

  addTimedBlockButton.addEventListener("click", () => {
    if (editState.index !== -1) return
    const site = timedBlockInput.value.trim().toLowerCase()
    const startTime = startTimeInput.value
    const endTime = endTimeInput.value

    if (
      validateAndAddRule({
        type: "timed",
        site,
        startTime,
        endTime,
        subpageMode: "none",
        subpageWhitelist: [],
        subpageBlacklist: [],
      })
    ) {
      timedBlockInput.value = ""
      startTimeInput.value = ""
      endTimeInput.value = ""
    }
  })

  function handleSaveChanges() {
    if (editState.index === -1) return

    let updatedRuleData = {}
    let isValid = true

    if (editState.type === "always") {
      const site = alwaysBlockInput.value.trim().toLowerCase()
      if (!site) {
        alert("Website URL cannot be empty.")
        isValid = false
      } else {
        updatedRuleData.site = site
      }
    } else if (editState.type === "timed") {
      const site = timedBlockInput.value.trim().toLowerCase()
      const startTime = startTimeInput.value
      const endTime = endTimeInput.value

      if (!site || !startTime || !endTime) {
        alert("All fields for time-scheduled blocking must be filled.")
        isValid = false
      } else if (!isTimeFormatValid(startTime) || !isTimeFormatValid(endTime)) {
        alert("Invalid time format. Please use HH:MM.")
        isValid = false
      } else if (startTime === endTime) {
        alert("Start and end time cannot be identical.")
        isValid = false
      } else {
        updatedRuleData.site = site
        updatedRuleData.startTime = startTime
        updatedRuleData.endTime = endTime
      }
    }

    if (isValid) {
      updatedRuleData.subpageMode = editState.subpageMode
      updatedRuleData.subpageWhitelist = [...editState.subpageWhitelist]
      updatedRuleData.subpageBlacklist = [...editState.subpageBlacklist]

      const originalSite = rules[editState.index].site
      const newSite = updatedRuleData.site
      const isSiteChanged = originalSite !== newSite

      if (isSiteChanged) {
        const exists = rules.some(
          (r, idx) =>
            idx !== editState.index &&
            r.type === editState.type &&
            r.site === newSite &&
            (r.type === "always" ||
              (r.startTime === updatedRuleData.startTime &&
                r.endTime === updatedRuleData.endTime))
        )
        if (exists) {
          alert(
            "This exact rule (site and time for timed rules) already exists."
          )
          isValid = false
        }
      }

      if (isValid) {
        rules[editState.index] = {
          ...rules[editState.index],
          ...updatedRuleData,
        }
        saveRulesToStorage()
        exitEditMode()
      }
    }
  }

  function handleCancelEdit() {
    exitEditMode()
  }

  function renderLists() {
    alwaysBlockListUI.innerHTML = ""
    timedBlockListUI.innerHTML = ""

    if (rules.length === 0) {
      // alwaysBlockListUI.innerHTML = "<li>No websites are permanently blocked.</li>";
      // timedBlockListUI.innerHTML = "<li>No websites are scheduled for blocking.</li>";
    }

    rules.forEach((rule, index) => {
      const li = document.createElement("li")
      li.classList.add(`rule-item-${rule.type}`)
      if (editState.index === index) {
        li.classList.add("editing")
      }

      const ruleTextDiv = document.createElement("div")
      ruleTextDiv.classList.add("rule-text")

      const siteUrlSpan = document.createElement("span")
      siteUrlSpan.classList.add("site-url")
      siteUrlSpan.textContent = rule.site
      ruleTextDiv.appendChild(siteUrlSpan)

      if (rule.type === "timed") {
        const timeSpan = document.createElement("span")
        timeSpan.classList.add("time-details")
        timeSpan.textContent = ` (${rule.startTime} - ${rule.endTime})`
        ruleTextDiv.appendChild(timeSpan)
      }

      if (rule.subpageMode && rule.subpageMode !== "none") {
        const subpageSummarySpan = document.createElement("span")
        subpageSummarySpan.classList.add("subpage-summary")
        if (
          rule.subpageMode === "whitelist" &&
          rule.subpageWhitelist &&
          rule.subpageWhitelist.length > 0
        ) {
          subpageSummarySpan.textContent = ` (Whitelisting ${
            rule.subpageWhitelist.length
          } subpage${rule.subpageWhitelist.length > 1 ? "s" : ""})`
        } else if (
          rule.subpageMode === "blacklist" &&
          rule.subpageBlacklist &&
          rule.subpageBlacklist.length > 0
        ) {
          subpageSummarySpan.textContent = ` (Blacklisting ${
            rule.subpageBlacklist.length
          } subpage${rule.subpageBlacklist.length > 1 ? "s" : ""})`
        }
        if (subpageSummarySpan.textContent) {
          ruleTextDiv.appendChild(subpageSummarySpan)
        }
      }
      li.appendChild(ruleTextDiv)

      const actionsContainer = document.createElement("div")
      actionsContainer.classList.add("list-item-actions")

      const editButton = document.createElement("button")
      editButton.textContent = "Edit" // Icon: ✏️
      editButton.classList.add("edit-button")
      editButton.addEventListener("click", () => enterEditMode(index))
      actionsContainer.appendChild(editButton)

      const removeButton = document.createElement("button")
      removeButton.textContent = "Remove" // Icon: 🗑️
      removeButton.classList.add("remove-button")
      removeButton.addEventListener("click", () => removeRule(index))
      actionsContainer.appendChild(removeButton)

      li.appendChild(actionsContainer)

      if (rule.type === "always") {
        alwaysBlockListUI.appendChild(li)
      } else {
        timedBlockListUI.appendChild(li)
      }
    })
  }

  function enterEditMode(index) {
    const ruleToEdit = rules[index]
    if (!ruleToEdit) return

    if (editState.index !== -1 && editState.index !== index) {
      exitEditMode(false)
    }

    editState = {
      index: index,
      type: ruleToEdit.type,
      originalRule: { ...ruleToEdit },
      subpageMode: ruleToEdit.subpageMode || "none",
      subpageWhitelist: ruleToEdit.subpageWhitelist
        ? [...ruleToEdit.subpageWhitelist]
        : [],
      subpageBlacklist: ruleToEdit.subpageBlacklist
        ? [...ruleToEdit.subpageBlacklist]
        : [],
    }

    addAlwaysBlockButton.style.display = "none"
    addTimedBlockButton.style.display = "none"
    if (saveChangesButton) saveChangesButton.style.display = "inline-block"
    if (cancelEditButton) cancelEditButton.style.display = "inline-block"

    if (editState.type === "always") {
      alwaysBlockInput.value = ruleToEdit.site
      alwaysBlockInput.disabled = false
      timedBlockInput.disabled = true
      startTimeInput.disabled = true
      endTimeInput.disabled = true
    } else if (editState.type === "timed") {
      timedBlockInput.value = ruleToEdit.site
      startTimeInput.value = ruleToEdit.startTime
      endTimeInput.value = ruleToEdit.endTime
      timedBlockInput.disabled = false
      startTimeInput.disabled = false
      endTimeInput.disabled = false
      alwaysBlockInput.disabled = true
    }

    editingDomainNameSpan.textContent = ruleToEdit.site
    editingMainUrlDisplays.forEach(
      (span) => (span.textContent = ruleToEdit.site)
    )

    subpageModeRadios.forEach((radio) => {
      radio.checked = radio.value === editState.subpageMode
    })
    updateSubpageExplanationAndInputs()
    renderSubpageLists()

    subpageRulesEditSection.style.display = "block"
    renderLists()
  }

  function exitEditMode(performRender = true) {
    alwaysBlockInput.value = ""
    timedBlockInput.value = ""
    startTimeInput.value = ""
    endTimeInput.value = ""

    addAlwaysBlockButton.style.display = "inline-block"
    addTimedBlockButton.style.display = "inline-block"
    if (saveChangesButton) saveChangesButton.style.display = "none"
    if (cancelEditButton) cancelEditButton.style.display = "none"

    alwaysBlockInput.disabled = false
    timedBlockInput.disabled = false
    startTimeInput.disabled = false
    endTimeInput.disabled = false

    subpageRulesEditSection.style.display = "none"
    editingDomainNameSpan.textContent = ""
    editState = {
      index: -1,
      type: "",
      originalRule: null,
      subpageMode: "none",
      subpageWhitelist: [],
      subpageBlacklist: [],
    }

    if (performRender) {
      renderLists()
    }
  }

  subpageModeRadios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      if (editState.index === -1) return
      editState.subpageMode = event.target.value
      updateSubpageExplanationAndInputs()
    })
  })

  function updateSubpageExplanationAndInputs() {
    const currentMainUrl = editState.originalRule
      ? editState.originalRule.site
      : "this domain"
    editingMainUrlDisplays.forEach(
      (span) => (span.textContent = currentMainUrl)
    )

    subpageWhitelistExplanation.style.display =
      editState.subpageMode === "whitelist" ? "block" : "none"
    subpageBlacklistExplanation.style.display =
      editState.subpageMode === "blacklist" ? "block" : "none"
    subpageWhitelistManagementDiv.style.display =
      editState.subpageMode === "whitelist" ? "block" : "none"
    subpageBlacklistManagementDiv.style.display =
      editState.subpageMode === "blacklist" ? "block" : "none"
  }

  addSubpageWhitelistButton.addEventListener("click", () => {
    if (editState.index === -1 || editState.subpageMode !== "whitelist") return
    const subpage = subpageWhitelistInput.value.trim()
    if (subpage && !editState.subpageWhitelist.includes(subpage)) {
      if (!subpage.startsWith("/")) {
        alert(
          "Subpage path must start with a '/' (e.g., /articles/technology)."
        )
        return
      }
      editState.subpageWhitelist.push(subpage)
      subpageWhitelistInput.value = ""
      renderSubpageLists()
    } else if (editState.subpageWhitelist.includes(subpage)) {
      alert("This subpage is already in the whitelist.")
    }
  })

  addSubpageBlacklistButton.addEventListener("click", () => {
    if (editState.index === -1 || editState.subpageMode !== "blacklist") return
    const subpage = subpageBlacklistInput.value.trim()
    if (subpage && !editState.subpageBlacklist.includes(subpage)) {
      if (!subpage.startsWith("/")) {
        alert(
          "Subpage path must start with a '/' (e.g., /games or /forum/offtopic)."
        )
        return
      }
      editState.subpageBlacklist.push(subpage)
      subpageBlacklistInput.value = ""
      renderSubpageLists()
    } else if (editState.subpageBlacklist.includes(subpage)) {
      alert("This subpage is already in the blacklist.")
    }
  })

  function renderSubpageLists() {
    subpageWhitelistUI.innerHTML = ""
    editState.subpageWhitelist.forEach((path, idx) => {
      const li = document.createElement("li")
      li.textContent = path
      const removeBtn = document.createElement("button")
      removeBtn.textContent = "Remove"
      removeBtn.classList.add("remove-subpage-button")
      removeBtn.addEventListener("click", () => {
        editState.subpageWhitelist.splice(idx, 1)
        renderSubpageLists()
      })
      li.appendChild(removeBtn)
      subpageWhitelistUI.appendChild(li)
    })

    subpageBlacklistUI.innerHTML = ""
    editState.subpageBlacklist.forEach((path, idx) => {
      const li = document.createElement("li")
      li.textContent = path
      const removeBtn = document.createElement("button")
      removeBtn.textContent = "Remove"
      removeBtn.classList.add("remove-subpage-button")
      removeBtn.addEventListener("click", () => {
        editState.subpageBlacklist.splice(idx, 1)
        renderSubpageLists()
      })
      li.appendChild(removeBtn)
      subpageBlacklistUI.appendChild(li)
    })
  }

  function isTimeFormatValid(time) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time)
  }

  function validateAndAddRule(ruleData) {
    ruleData.subpageMode = ruleData.subpageMode || "none"
    ruleData.subpageWhitelist = ruleData.subpageWhitelist || []
    ruleData.subpageBlacklist = ruleData.subpageBlacklist || []

    if (ruleData.type === "always") {
      if (!ruleData.site) {
        alert("Website URL cannot be empty.")
        return false
      }
    } else if (ruleData.type === "timed") {
      if (!ruleData.site || !ruleData.startTime || !ruleData.endTime) {
        alert("All fields for time-scheduled blocking must be filled.")
        return false
      }
      if (
        !isTimeFormatValid(ruleData.startTime) ||
        !isTimeFormatValid(ruleData.endTime)
      ) {
        alert("Invalid time format. Please use HH:MM.")
        return false
      }
      if (ruleData.startTime === ruleData.endTime) {
        alert("Start and end time cannot be identical for a scheduled block.")
        return false
      }
    }

    const exists = rules.some(
      (r) =>
        r.type === ruleData.type &&
        r.site === ruleData.site &&
        (r.type === "always" ||
          (r.startTime === ruleData.startTime &&
            r.endTime === ruleData.endTime))
    )

    if (exists) {
      alert("This rule (or an identical one) already exists.")
      return false
    }

    rules.push(ruleData)
    saveRulesToStorage()
    return true
  }

  async function loadRulesAndRender() {
    try {
      const result = await chrome.storage.local.get(["blockedRules"])
      rules = result.blockedRules || []
      rules = rules.map((rule) => ({
        ...rule,
        subpageMode: rule.subpageMode || "none",
        subpageWhitelist: rule.subpageWhitelist || [],
        subpageBlacklist: rule.subpageBlacklist || [],
      }))
    } catch (e) {
      console.error("Error loading rules from storage:", e)
      rules = []
    }
    renderLists()
    exitEditMode(false)
  }

  async function saveRulesToStorage() {
    try {
      await chrome.storage.local.set({ blockedRules: rules })
      chrome.runtime.sendMessage({ type: "rulesUpdated" }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("SW message failed:", chrome.runtime.lastError.message)
        }
      })
    } catch (e) {
      console.error("Error saving rules to storage:", e)
    }
    renderLists()
  }

  function removeRule(indexToRemove) {
    if (editState.index === indexToRemove) {
      exitEditMode(false)
    }
    if (indexToRemove >= 0 && indexToRemove < rules.length) {
      rules.splice(indexToRemove, 1)
      saveRulesToStorage()
      if (editState.index > indexToRemove) {
        editState.index--
      }
    } else {
      console.error("Invalid index for removal:", indexToRemove)
    }
  }
})
