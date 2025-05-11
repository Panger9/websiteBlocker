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

  const globalEditButtonContainer = document.getElementById("timedBlockButtons")

  let saveChangesButton
  let cancelEditButton

  let rules = []
  let editState = {
    index: -1,
    type: "",
    originalRule: null,
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
    }
  }

  addAlwaysBlockButton.addEventListener("click", () => {
    if (editState.index !== -1) return
    const site = alwaysBlockInput.value.trim().toLowerCase()
    if (validateAndAddRule({ type: "always", site })) {
      alwaysBlockInput.value = ""
    }
  })

  addTimedBlockButton.addEventListener("click", () => {
    if (editState.index !== -1) return
    const site = timedBlockInput.value.trim().toLowerCase()
    const startTime = startTimeInput.value
    const endTime = endTimeInput.value

    if (validateAndAddRule({ type: "timed", site, startTime, endTime })) {
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
        updatedRuleData = { site }
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
        updatedRuleData = { site, startTime, endTime }
      }
    }

    if (isValid) {
      rules[editState.index] = { ...rules[editState.index], ...updatedRuleData }
      saveRulesToStorage()
      exitEditMode()
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
      const ruleTextDiv = document.createElement("div")
      ruleTextDiv.classList.add("rule-text")

      const siteUrlSpan = document.createElement("span")
      siteUrlSpan.classList.add("site-url")
      siteUrlSpan.textContent = rule.site
      ruleTextDiv.appendChild(siteUrlSpan)

      if (rule.type === "timed") {
        const timeInfoSpan = document.createElement("span")
        timeInfoSpan.classList.add("time-info")
        timeInfoSpan.textContent = `Blocked from ${rule.startTime} to ${rule.endTime}`
        ruleTextDiv.appendChild(timeInfoSpan)
        timedBlockListUI.appendChild(li)
      } else {
        alwaysBlockListUI.appendChild(li)
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
    })
  }

  function enterEditMode(index) {
    const ruleToEdit = rules[index]
    if (!ruleToEdit) return

    editState = {
      index: index,
      type: ruleToEdit.type,
      originalRule: { ...ruleToEdit },
    }

    addAlwaysBlockButton.style.display = "none"
    addTimedBlockButton.style.display = "none"
    if (saveChangesButton) saveChangesButton.style.display = "inline-block"
    if (cancelEditButton) cancelEditButton.style.display = "inline-block"

    if (editState.type === "always") {
      alwaysBlockInput.value = ruleToEdit.site
      alwaysBlockInput.disabled = false
      alwaysBlockInput.focus()

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
      timedBlockInput.focus()

      alwaysBlockInput.disabled = true
    }
  }

  function exitEditMode() {
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

    editState = { index: -1, type: "", originalRule: null }
  }

  function isTimeFormatValid(time) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time)
  }

  function validateAndAddRule(ruleData) {
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
    } catch (e) {
      console.error("Error loading rules from storage:", e)
      rules = []
    }
    renderLists()
    exitEditMode()
  }

  async function saveRulesToStorage() {
    try {
      await chrome.storage.local.set({ blockedRules: rules })
      chrome.runtime.sendMessage({ type: "rulesUpdated" }, (response) => {
        if (chrome.runtime.lastError) {
          // console.warn("SW message failed:", chrome.runtime.lastError.message);
        }
      })
    } catch (e) {
      console.error("Error saving rules to storage:", e)
    }
    renderLists()
  }

  function removeRule(indexToRemove) {
    if (indexToRemove >= 0 && indexToRemove < rules.length) {
      // Optional: Confirmation dialog
      // if (!confirm(`Are you sure you want to remove the rule for "${rules[indexToRemove].site}"?`)) {
      //     return;
      // }
      rules.splice(indexToRemove, 1)
      saveRulesToStorage()
      if (editState.index === indexToRemove || editState.index !== -1) {
        exitEditMode()
      }
    } else {
      console.error("Invalid index for removal:", indexToRemove)
    }
  }
})
