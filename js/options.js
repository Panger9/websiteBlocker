// js/options.js

document.addEventListener("DOMContentLoaded", () => {
  // Input fields and buttons
  const alwaysBlockInput = document.getElementById("alwaysBlockInput")
  const addAlwaysBlockButton = document.getElementById("addAlwaysBlock")
  const alwaysBlockListUI = document.getElementById("alwaysBlockList")

  const timedBlockInput = document.getElementById("timedBlockInput")
  const startTimeInput = document.getElementById("startTime")
  const endTimeInput = document.getElementById("endTime")
  const addTimedBlockButton = document.getElementById("addTimedBlock")
  const timedBlockListUI = document.getElementById("timedBlockList")
  // Template for subpage configuration
  const subpageTemplate = document.getElementById("subpage-rules-template")

  // References to the sections where subpage config will be inserted
  const alwaysBlockSection = document.getElementById("always-block-section")
  const timedBlockSection = document.getElementById("timed-block-section")

  // Current subpage configuration elements (will be set when editing)
  let currentSubpageSection = null
  let subpageModeRadios = null
  let subpageWhitelistExplanation = null
  let subpageBlacklistExplanation = null
  let subpageWhitelistManagementDiv = null
  let subpageBlacklistManagementDiv = null
  let subpageWhitelistInput = null
  let addSubpageWhitelistButton = null
  let subpageWhitelistUI = null
  let subpageBlacklistInput = null
  let addSubpageBlacklistButton = null
  let subpageBlacklistUI = null
  let editingMainUrlDisplays = null
  let editingDomainNameSpan = null
  let saveChangesButton = null
  let cancelEditButton = null

  let rules = []
  let editState = {
    index: -1,
    type: "",
    originalRule: null,
    subpageMode: "none",
    subpageWhitelist: [],
    subpageBlacklist: [],
  }

  loadRulesAndRender()

  // Function to create and insert subpage configuration section
  function createSubpageSection(targetSection) {
    // Remove any existing subpage section
    removeSubpageSection()

    // Clone the template
    const templateContent = subpageTemplate.content.cloneNode(true)
    currentSubpageSection = templateContent.querySelector(
      ".subpage-rules-edit-section"
    )

    // Get references to the elements in the cloned template
    subpageModeRadios = currentSubpageSection.querySelectorAll(
      'input[name="subpageMode"]'
    )
    subpageWhitelistExplanation = currentSubpageSection.querySelector(
      ".subpage-whitelist-explanation"
    )
    subpageBlacklistExplanation = currentSubpageSection.querySelector(
      ".subpage-blacklist-explanation"
    )
    subpageWhitelistManagementDiv = currentSubpageSection.querySelector(
      ".subpage-whitelist-management"
    )
    subpageBlacklistManagementDiv = currentSubpageSection.querySelector(
      ".subpage-blacklist-management"
    )
    subpageWhitelistInput = currentSubpageSection.querySelector(
      ".subpageWhitelistInput"
    )
    addSubpageWhitelistButton = currentSubpageSection.querySelector(
      ".addSubpageWhitelist"
    )
    subpageWhitelistUI = currentSubpageSection.querySelector(
      ".subpageWhitelistUI"
    )
    subpageBlacklistInput = currentSubpageSection.querySelector(
      ".subpageBlacklistInput"
    )
    addSubpageBlacklistButton = currentSubpageSection.querySelector(
      ".addSubpageBlacklist"
    )
    subpageBlacklistUI = currentSubpageSection.querySelector(
      ".subpageBlacklistUI"
    )
    editingMainUrlDisplays = currentSubpageSection.querySelectorAll(
      ".editing-main-url-display"
    )
    editingDomainNameSpan =
      currentSubpageSection.querySelector(".editingDomainName")
    saveChangesButton =
      currentSubpageSection.querySelector(".saveChangesButton")
    cancelEditButton = currentSubpageSection.querySelector(".cancelEditButton")

    // Add event listeners to the new elements
    setupSubpageEventListeners()

    // Insert the section after the target section
    targetSection.appendChild(currentSubpageSection)

    return currentSubpageSection
  }

  // Function to remove existing subpage section
  function removeSubpageSection() {
    if (currentSubpageSection && currentSubpageSection.parentNode) {
      currentSubpageSection.parentNode.removeChild(currentSubpageSection)
      currentSubpageSection = null
    }
  }

  // Function to setup event listeners for subpage elements
  function setupSubpageEventListeners() {
    if (!currentSubpageSection) return

    // Save and Cancel buttons
    saveChangesButton.addEventListener("click", handleSaveChanges)
    cancelEditButton.addEventListener("click", handleCancelEdit)

    // Subpage mode radio buttons
    subpageModeRadios.forEach((radio) => {
      radio.addEventListener("change", (event) => {
        if (editState.index === -1) return
        editState.subpageMode = event.target.value
        updateSubpageExplanationAndInputs()
      })
    })
    // Whitelist management
    addSubpageWhitelistButton.addEventListener("click", () => {
      if (editState.index === -1 || editState.subpageMode !== "whitelist")
        return
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
      } else if (!subpage) {
        alert("Please enter a subpage path.")
      } else {
        alert("This subpage is already in the whitelist.")
      }
    })

    // Blacklist management
    addSubpageBlacklistButton.addEventListener("click", () => {
      if (editState.index === -1 || editState.subpageMode !== "blacklist")
        return
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
      } else if (!subpage) {
        alert("Please enter a subpage path.")
      } else {
        alert("This subpage is already in the blacklist.")
      }
    })
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
      if (!validateDomainInput(site)) {
        alert(
          "Invalid domain format. Please enter a valid domain name (e.g., example.com)."
        )
        isValid = false
      } else {
        updatedRuleData.site = site
      }
    } else if (editState.type === "timed") {
      const site = timedBlockInput.value.trim().toLowerCase()
      const startTime = startTimeInput.value
      const endTime = endTimeInput.value

      if (!validateDomainInput(site) || !startTime || !endTime) {
        if (!validateDomainInput(site)) {
          alert(
            "Invalid domain format. Please enter a valid domain name (e.g., example.com)."
          )
        } else {
          alert("All fields for time-scheduled blocking must be filled.")
        }
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

    // Create subpage section in the appropriate location
    const targetSection =
      editState.type === "always" ? alwaysBlockSection : timedBlockSection
    createSubpageSection(targetSection)

    addAlwaysBlockButton.style.display = "none"
    addTimedBlockButton.style.display = "none"

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

    currentSubpageSection.style.display = "block"
    renderLists()
  }
  function exitEditMode(performRender = true) {
    alwaysBlockInput.value = ""
    timedBlockInput.value = ""
    startTimeInput.value = ""
    endTimeInput.value = ""

    addAlwaysBlockButton.style.display = "inline-block"
    addTimedBlockButton.style.display = "inline-block"

    alwaysBlockInput.disabled = false
    timedBlockInput.disabled = false
    startTimeInput.disabled = false
    endTimeInput.disabled = false

    // Remove the subpage section
    removeSubpageSection()

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

  function updateSubpageExplanationAndInputs() {
    if (!currentSubpageSection) return

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

  function renderSubpageLists() {
    if (!currentSubpageSection) return

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

  // Input validation helper function
  function validateDomainInput(domain) {
    if (!domain || typeof domain !== "string") {
      return false
    }

    const trimmedDomain = domain.trim().toLowerCase()

    if (trimmedDomain === "") {
      return false
    }

    // Basic domain validation regex
    const domainRegex =
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

    if (!domainRegex.test(trimmedDomain)) {
      return false
    }

    // Additional checks for common invalid patterns
    if (
      trimmedDomain.includes("..") ||
      trimmedDomain.startsWith(".") ||
      trimmedDomain.endsWith(".")
    ) {
      return false
    }

    return true
  }

  function validateAndAddRule(ruleData) {
    ruleData.subpageMode = ruleData.subpageMode || "none"
    ruleData.subpageWhitelist = ruleData.subpageWhitelist || []
    ruleData.subpageBlacklist = ruleData.subpageBlacklist || []

    // Validate and sanitize domain input
    if (!validateDomainInput(ruleData.site)) {
      alert(
        "Invalid domain format. Please enter a valid domain name (e.g., example.com)."
      )
      return false
    }

    // Sanitize the domain
    ruleData.site = ruleData.site.trim().toLowerCase()

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
