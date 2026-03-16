document.addEventListener("DOMContentLoaded", () => {
  const {
    RULE_TYPES,
    SUBPAGE_MODES,
    normalizeRules,
    normalizeRule,
    validateRuleInput,
    validatePatternInput,
    getRuleSummary,
    createRuleKey,
  } = SiteBlockerRules

  const elements = {
    formTitle: document.getElementById("editorTitle"),
    formHint: document.getElementById("editorHint"),
    typeRadios: Array.from(document.querySelectorAll('input[name="ruleType"]')),
    domainInput: document.getElementById("domainInput"),
    startTimeInput: document.getElementById("startTime"),
    endTimeInput: document.getElementById("endTime"),
    timeFields: document.getElementById("timeFields"),
    strategyRadios: Array.from(
      document.querySelectorAll('input[name="subpageMode"]')
    ),
    whitelistPanel: document.getElementById("whitelistPanel"),
    blacklistPanel: document.getElementById("blacklistPanel"),
    whitelistInput: document.getElementById("whitelistInput"),
    blacklistInput: document.getElementById("blacklistInput"),
    whitelistAddButton: document.getElementById("addWhitelistPattern"),
    blacklistAddButton: document.getElementById("addBlacklistPattern"),
    whitelistList: document.getElementById("whitelistPatterns"),
    blacklistList: document.getElementById("blacklistPatterns"),
    rulesList: document.getElementById("rulesList"),
    emptyState: document.getElementById("rulesEmptyState"),
    saveButton: document.getElementById("saveRule"),
    cancelButton: document.getElementById("cancelEdit"),
    formStatus: document.getElementById("formStatus"),
    siteError: document.getElementById("siteError"),
    scheduleError: document.getElementById("scheduleError"),
    subpageError: document.getElementById("subpageError"),
    patternHint: document.getElementById("patternHint"),
  }

  const state = {
    rules: [],
    editorMode: "create",
    editingIndex: -1,
    draft: createEmptyDraft(),
  }

  bindEvents()
  loadRules()

  function createEmptyDraft() {
    return {
      type: RULE_TYPES.ALWAYS,
      site: "",
      startTime: "",
      endTime: "",
      subpageMode: SUBPAGE_MODES.NONE,
      subpageWhitelist: [],
      subpageBlacklist: [],
    }
  }

  function bindEvents() {
    elements.typeRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        state.draft.type = radio.value
        renderEditor()
      })
    })

    elements.strategyRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        state.draft.subpageMode = radio.value
        clearFieldError(elements.subpageError)
        renderEditor()
      })
    })

    elements.domainInput.addEventListener("input", () => {
      state.draft.site = elements.domainInput.value
      clearFieldError(elements.siteError)
      clearStatus()
    })

    elements.startTimeInput.addEventListener("input", () => {
      state.draft.startTime = elements.startTimeInput.value
      clearFieldError(elements.scheduleError)
      clearStatus()
    })

    elements.endTimeInput.addEventListener("input", () => {
      state.draft.endTime = elements.endTimeInput.value
      clearFieldError(elements.scheduleError)
      clearStatus()
    })

    elements.whitelistAddButton.addEventListener("click", () => {
      addPattern("whitelist")
    })

    elements.blacklistAddButton.addEventListener("click", () => {
      addPattern("blacklist")
    })

    elements.saveButton.addEventListener("click", handleSubmit)
    elements.cancelButton.addEventListener("click", resetEditor)
  }

  async function loadRules() {
    try {
      const result = await chrome.storage.local.get(["blockedRules"])
      state.rules = normalizeRules(result.blockedRules || [])
    } catch (error) {
      console.error("Failed to load rules.", error)
      state.rules = []
      showStatus("Could not load saved rules.", "error")
    }

    resetEditor()
    renderRules()
  }

  async function persistRules() {
    state.rules = normalizeRules(state.rules)
    await chrome.storage.local.set({ blockedRules: state.rules })

    chrome.runtime.sendMessage({ type: "rulesUpdated" }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Rule refresh message failed.", chrome.runtime.lastError.message)
      }
    })
  }

  function handleSubmit() {
    clearValidation()

    const candidate = normalizeRule({
      ...state.draft,
      site: elements.domainInput.value,
      startTime: elements.startTimeInput.value,
      endTime: elements.endTimeInput.value,
    })

    const result = validateRuleInput(
      candidate,
      state.rules,
      state.editorMode === "edit" ? state.editingIndex : -1
    )

    if (!result.valid) {
      renderValidation(result.errors)
      showStatus("Fix the highlighted fields before saving.", "error")
      return
    }

    if (state.editorMode === "edit") {
      state.rules[state.editingIndex] = result.normalizedRule
      showStatus("Rule updated.", "success")
    } else {
      state.rules.unshift(result.normalizedRule)
      showStatus("Rule created.", "success")
    }

    persistRules()
      .then(() => {
        resetEditor(false)
        renderRules()
      })
      .catch((error) => {
        console.error("Failed to save rules.", error)
        showStatus("Could not save the rule. Try again.", "error")
      })
  }

  function addPattern(mode) {
    const isWhitelist = mode === "whitelist"
    const input = isWhitelist ? elements.whitelistInput : elements.blacklistInput
    const targetKey = isWhitelist ? "subpageWhitelist" : "subpageBlacklist"
    const validation = validatePatternInput(input.value)

    clearFieldError(elements.subpageError)
    clearStatus()

    if (!validation.valid) {
      setFieldError(elements.subpageError, validation.message)
      return
    }

    if (state.draft[targetKey].includes(validation.normalized)) {
      setFieldError(elements.subpageError, "That pattern is already listed.")
      return
    }

    state.draft[targetKey] = [...state.draft[targetKey], validation.normalized]
    input.value = ""
    renderPatternLists()
    updatePatternHint()
  }

  function removePattern(mode, pattern) {
    const key = mode === "whitelist" ? "subpageWhitelist" : "subpageBlacklist"
    state.draft[key] = state.draft[key].filter((entry) => entry !== pattern)
    renderPatternLists()
    updatePatternHint()
  }

  function startEdit(index) {
    state.editorMode = "edit"
    state.editingIndex = index
    state.draft = normalizeRule(state.rules[index])
    clearValidation()
    renderEditor()
  }

  function resetEditor(clearMessage = true) {
    state.editorMode = "create"
    state.editingIndex = -1
    state.draft = createEmptyDraft()
    clearValidation()
    renderEditor()

    if (clearMessage) {
      clearStatus()
    }
  }

  function renderEditor() {
    const isScheduled = state.draft.type === RULE_TYPES.TIMED
    const isEditing = state.editorMode === "edit"

    elements.formTitle.textContent = isEditing
      ? "Edit blocking rule"
      : "Create a new blocking rule"
    elements.formHint.textContent = isEditing
      ? "Adjust the domain, schedule and subpage strategy in one place."
      : "Block an entire domain or make it more precise with allowed or blocked paths."

    elements.typeRadios.forEach((radio) => {
      radio.checked = radio.value === state.draft.type
    })

    elements.strategyRadios.forEach((radio) => {
      radio.checked = radio.value === state.draft.subpageMode
    })

    elements.domainInput.value = state.draft.site
    elements.startTimeInput.value = state.draft.startTime
    elements.endTimeInput.value = state.draft.endTime
    elements.timeFields.hidden = !isScheduled
    elements.whitelistPanel.hidden = state.draft.subpageMode !== SUBPAGE_MODES.WHITELIST
    elements.blacklistPanel.hidden = state.draft.subpageMode !== SUBPAGE_MODES.BLACKLIST
    elements.saveButton.textContent = isEditing ? "Save changes" : "Add rule"
    elements.cancelButton.hidden = !isEditing

    renderPatternLists()
    updatePatternHint()
  }

  function renderPatternLists() {
    renderPatternList(
      elements.whitelistList,
      state.draft.subpageWhitelist,
      "whitelist"
    )
    renderPatternList(
      elements.blacklistList,
      state.draft.subpageBlacklist,
      "blacklist"
    )
  }

  function renderPatternList(container, patterns, mode) {
    container.innerHTML = ""

    if (patterns.length === 0) {
      const empty = document.createElement("li")
      empty.className = "pattern-empty"
      empty.textContent =
        mode === "whitelist"
          ? "No allowed paths yet."
          : "No blocked paths yet."
      container.appendChild(empty)
      return
    }

    patterns.forEach((pattern) => {
      const item = document.createElement("li")
      item.className = "pattern-chip"

      const label = document.createElement("span")
      label.textContent = pattern

      const remove = document.createElement("button")
      remove.type = "button"
      remove.className = "chip-remove"
      remove.textContent = "Remove"
      remove.addEventListener("click", () => removePattern(mode, pattern))

      item.append(label, remove)
      container.appendChild(item)
    })
  }

  function renderRules() {
    elements.rulesList.innerHTML = ""
    elements.emptyState.hidden = state.rules.length > 0

    state.rules.forEach((rule, index) => {
      const summary = getRuleSummary(rule)
      const card = document.createElement("article")
      card.className = "rule-card"

      const header = document.createElement("div")
      header.className = "rule-card-header"

      const titleWrap = document.createElement("div")
      const domain = document.createElement("h3")
      domain.className = "rule-domain"
      domain.textContent = rule.site

      const subtitle = document.createElement("p")
      subtitle.className = "rule-meta"
      subtitle.textContent = summary.scheduleLabel

      titleWrap.append(domain, subtitle)

      const badgeRow = document.createElement("div")
      badgeRow.className = "badge-row"
      badgeRow.append(
        createBadge(summary.typeLabel, "type"),
        createBadge(summary.modeLabel, "mode"),
        createBadge(summary.details, "detail")
      )

      header.append(titleWrap, badgeRow)

      const preview = document.createElement("p")
      preview.className = "rule-preview"
      preview.textContent =
        summary.previewPatterns.length > 0
          ? `Preview: ${summary.previewPatterns.join("  •  ")}`
          : "Blocks the entire domain."

      const actions = document.createElement("div")
      actions.className = "rule-actions"

      const editButton = document.createElement("button")
      editButton.type = "button"
      editButton.className = "secondary-button"
      editButton.textContent = "Edit"
      editButton.addEventListener("click", () => startEdit(index))

      const deleteButton = document.createElement("button")
      deleteButton.type = "button"
      deleteButton.className = "danger-button"
      deleteButton.textContent = "Delete"
      deleteButton.addEventListener("click", () => removeRule(index))

      actions.append(editButton, deleteButton)
      card.append(header, preview, actions)
      elements.rulesList.appendChild(card)
    })
  }

  function removeRule(index) {
    const removedRule = state.rules[index]
    state.rules = state.rules.filter((_, ruleIndex) => ruleIndex !== index)

    if (
      state.editorMode === "edit" &&
      createRuleKey(removedRule) === createRuleKey(state.draft)
    ) {
      resetEditor(false)
    }

    persistRules()
      .then(() => {
        renderRules()
        showStatus("Rule deleted.", "success")
      })
      .catch((error) => {
        console.error("Failed to remove rule.", error)
        showStatus("Could not delete the rule. Try again.", "error")
      })
  }

  function createBadge(text, variant) {
    const badge = document.createElement("span")
    badge.className = `badge badge-${variant}`
    badge.textContent = text
    return badge
  }

  function renderValidation(errors) {
    if (errors.site) {
      setFieldError(elements.siteError, errors.site)
    }
    if (errors.schedule) {
      setFieldError(elements.scheduleError, errors.schedule)
    }
    if (errors.subpage) {
      setFieldError(elements.subpageError, errors.subpage)
    }
  }

  function clearValidation() {
    clearFieldError(elements.siteError)
    clearFieldError(elements.scheduleError)
    clearFieldError(elements.subpageError)
  }

  function setFieldError(element, message) {
    element.textContent = message
    element.hidden = false
  }

  function clearFieldError(element) {
    element.textContent = ""
    element.hidden = true
  }

  function showStatus(message, tone) {
    elements.formStatus.textContent = message
    elements.formStatus.dataset.tone = tone
    elements.formStatus.hidden = false
  }

  function clearStatus() {
    elements.formStatus.hidden = true
    elements.formStatus.textContent = ""
    delete elements.formStatus.dataset.tone
  }

  function updatePatternHint() {
    const mode = state.draft.subpageMode

    if (mode === SUBPAGE_MODES.WHITELIST) {
      elements.patternHint.textContent =
        "Whitelist means the domain is blocked except for the paths below."
      return
    }

    if (mode === SUBPAGE_MODES.BLACKLIST) {
      elements.patternHint.textContent =
        "Blacklist means the domain stays open except for the paths below."
      return
    }

    elements.patternHint.textContent =
      "Pattern examples: /comments, /wiki/*, /shorts, /?feed=home"
  }
})
