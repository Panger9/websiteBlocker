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
    editorStateLabel: document.getElementById("editorStateLabel"),
    draftSummaryTitle: document.getElementById("draftSummaryTitle"),
    draftSummaryCopy: document.getElementById("draftSummaryCopy"),
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
    totalRulesCount: document.getElementById("totalRulesCount"),
    alwaysRulesCount: document.getElementById("alwaysRulesCount"),
    timedRulesCount: document.getElementById("timedRulesCount"),
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
        clearFieldError(elements.scheduleError)
        clearStatus()
        renderEditor()
      })
    })

    elements.strategyRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        state.draft.subpageMode = radio.value
        clearFieldError(elements.subpageError)
        clearStatus()
        renderEditor()
      })
    })

    elements.domainInput.addEventListener("input", () => {
      state.draft.site = elements.domainInput.value
      clearFieldError(elements.siteError)
      clearStatus()
      renderDraftSummary()
    })

    elements.startTimeInput.addEventListener("input", () => {
      state.draft.startTime = elements.startTimeInput.value
      clearFieldError(elements.scheduleError)
      clearStatus()
      renderDraftSummary()
    })

    elements.endTimeInput.addEventListener("input", () => {
      state.draft.endTime = elements.endTimeInput.value
      clearFieldError(elements.scheduleError)
      clearStatus()
      renderDraftSummary()
    })

    elements.whitelistAddButton.addEventListener("click", () => {
      addPattern("whitelist")
    })

    elements.blacklistAddButton.addEventListener("click", () => {
      addPattern("blacklist")
    })

    elements.whitelistInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault()
        addPattern("whitelist")
      }
    })

    elements.blacklistInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault()
        addPattern("blacklist")
      }
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
      showStatus("Fix the highlighted fields before saving this rule.", "error")
      return
    }

    if (state.editorMode === "edit") {
      state.rules[state.editingIndex] = result.normalizedRule
      showStatus("Rule updated.", "success")
    } else {
      state.rules.unshift(result.normalizedRule)
      showStatus("Rule saved.", "success")
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
      setFieldError(elements.subpageError, "That path is already listed.")
      return
    }

    state.draft[targetKey] = [...state.draft[targetKey], validation.normalized]
    input.value = ""
    renderPatternLists()
    updatePatternHint()
    renderDraftSummary()
  }

  function removePattern(mode, pattern) {
    const key = mode === "whitelist" ? "subpageWhitelist" : "subpageBlacklist"
    state.draft[key] = state.draft[key].filter((entry) => entry !== pattern)
    renderPatternLists()
    updatePatternHint()
    renderDraftSummary()
  }

  function startEdit(index) {
    state.editorMode = "edit"
    state.editingIndex = index
    state.draft = normalizeRule(state.rules[index])
    clearValidation()
    clearStatus()
    renderEditor()
    window.scrollTo({ top: 0, behavior: "smooth" })
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

    elements.editorStateLabel.textContent = isEditing
      ? "Editing existing rule"
      : "Creating a new rule"
    elements.formTitle.textContent = isEditing
      ? "Edit blocking rule"
      : "Create a blocking rule"
    elements.formHint.textContent = isEditing
      ? "Adjust the domain, schedule or path rules, then save the updated version."
      : "Create a simple domain rule or make it precise with allowed or blocked paths."

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
    elements.saveButton.textContent = isEditing ? "Save changes" : "Save rule"
    elements.cancelButton.hidden = !isEditing

    renderPatternLists()
    updatePatternHint()
    renderDraftSummary()
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
          ? "No allowed paths added yet."
          : "No blocked paths added yet."
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
    renderDashboardStats()

    state.rules.forEach((rule, index) => {
      const summary = getRuleSummary(rule)
      const card = document.createElement("article")
      card.className = "rule-card"

      const topline = document.createElement("div")
      topline.className = "rule-topline"

      const titleWrap = document.createElement("div")
      titleWrap.className = "rule-title-wrap"

      const domain = document.createElement("h3")
      domain.className = "rule-title"
      domain.textContent = rule.site

      const schedule = document.createElement("p")
      schedule.className = "rule-schedule"
      schedule.textContent = summary.scheduleLabel

      titleWrap.append(domain, schedule)

      const tags = document.createElement("div")
      tags.className = "rule-tags"
      tags.append(
        createTag(summary.typeLabel, "type"),
        createTag(summary.modeLabel, "mode"),
        createTag(summary.details, "detail")
      )

      topline.append(titleWrap, tags)

      const summaryText = document.createElement("p")
      summaryText.className = "rule-summary"
      summaryText.textContent = buildRuleNarrative(rule)

      const metaGrid = document.createElement("div")
      metaGrid.className = "rule-meta-grid"
      metaGrid.append(
        createMetaCard(
          "Active",
          summary.scheduleLabel,
          rule.type === RULE_TYPES.TIMED
            ? "This rule only runs during the selected hours."
            : "This rule stays active until you edit or delete it."
        ),
        createMetaCard(
          "Coverage",
          getCoverageLabel(rule.subpageMode),
          getCoverageCopy(rule)
        ),
        createMetaCard("Paths", getPathCountLabel(rule), getPathPreviewCopy(rule))
      )

      const pathList = document.createElement("div")
      pathList.className = "rule-paths"
      const pathEntries = getPathEntries(rule)
      pathEntries.forEach((entry) => {
        const chip = document.createElement("span")
        chip.className = "rule-path"
        chip.textContent = entry
        pathList.appendChild(chip)
      })

      const actions = document.createElement("div")
      actions.className = "rule-actions"

      const editButton = document.createElement("button")
      editButton.type = "button"
      editButton.className = "secondary-button"
      editButton.textContent = "Edit"
      editButton.setAttribute("aria-label", `Edit rule for ${rule.site}`)
      editButton.addEventListener("click", () => startEdit(index))

      const deleteButton = document.createElement("button")
      deleteButton.type = "button"
      deleteButton.className = "danger-button"
      deleteButton.textContent = "Delete"
      deleteButton.setAttribute("aria-label", `Delete rule for ${rule.site}`)
      deleteButton.addEventListener("click", () => removeRule(index))

      actions.append(editButton, deleteButton)
      card.append(topline, summaryText, metaGrid)

      if (pathEntries.length > 0) {
        card.appendChild(pathList)
      }

      card.appendChild(actions)
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

  function createTag(text, variant) {
    const tag = document.createElement("span")
    tag.className = `rule-tag rule-tag-${variant}`
    tag.textContent = text
    return tag
  }

  function createMetaCard(label, value, copy) {
    const card = document.createElement("section")
    card.className = "rule-meta-card"

    const labelElement = document.createElement("p")
    labelElement.className = "meta-label"
    labelElement.textContent = label

    const valueElement = document.createElement("p")
    valueElement.className = "meta-value"
    valueElement.textContent = value

    const copyElement = document.createElement("p")
    copyElement.className = "meta-copy"
    copyElement.textContent = copy

    card.append(labelElement, valueElement, copyElement)
    return card
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
        "The domain is blocked by default. Add the paths that should stay open."
      return
    }

    if (mode === SUBPAGE_MODES.BLACKLIST) {
      elements.patternHint.textContent =
        "The domain stays open by default. Add the paths that should be blocked."
      return
    }

    elements.patternHint.textContent =
      "Examples: /comments, /wiki/*, /shorts, /?feed=home"
  }

  function renderDraftSummary() {
    elements.draftSummaryTitle.textContent = buildDraftTitle()
    elements.draftSummaryCopy.textContent = buildDraftSummaryCopy()
  }

  function buildDraftTitle() {
    const site = state.draft.site.trim() || "this site"
    const hasCompleteSchedule =
      state.draft.type === RULE_TYPES.TIMED &&
      state.draft.startTime &&
      state.draft.endTime

    if (state.draft.subpageMode === SUBPAGE_MODES.WHITELIST) {
      return hasCompleteSchedule
        ? `Block ${site} from ${state.draft.startTime} to ${state.draft.endTime}, but keep selected paths open.`
        : `Block ${site}, but keep selected paths open.`
    }

    if (state.draft.subpageMode === SUBPAGE_MODES.BLACKLIST) {
      return hasCompleteSchedule
        ? `Keep ${site} open from ${state.draft.startTime} to ${state.draft.endTime}, except for selected paths.`
        : `Keep ${site} open, except for selected paths.`
    }

    if (hasCompleteSchedule) {
      return `Block ${site} from ${state.draft.startTime} to ${state.draft.endTime}.`
    }

    return `Block ${site} all day.`
  }

  function buildDraftSummaryCopy() {
    const site = state.draft.site.trim()

    if (!site) {
      return "Add a domain to generate a plain-language summary before you save the rule."
    }

    if (
      state.draft.type === RULE_TYPES.TIMED &&
      (!state.draft.startTime || !state.draft.endTime)
    ) {
      return "Choose both a start and end time so the rule schedule is complete."
    }

    if (state.draft.subpageMode === SUBPAGE_MODES.WHITELIST) {
      const count = state.draft.subpageWhitelist.length
      return count > 0
        ? `${count} allowed path${count === 1 ? "" : "s"} will stay reachable while the rest of ${site} is blocked.`
        : `Add at least one allowed path. Without it, the whole domain would still be blocked.`
    }

    if (state.draft.subpageMode === SUBPAGE_MODES.BLACKLIST) {
      const count = state.draft.subpageBlacklist.length
      return count > 0
        ? `${count} blocked path${count === 1 ? "" : "s"} will be denied while the rest of ${site} stays available.`
        : `Add at least one blocked path. Without it, the domain would stay fully open.`
    }

    return `Every page on ${site} will be blocked.`
  }

  function renderDashboardStats() {
    const alwaysCount = state.rules.filter((rule) => rule.type === RULE_TYPES.ALWAYS).length
    const timedCount = state.rules.filter((rule) => rule.type === RULE_TYPES.TIMED).length

    elements.totalRulesCount.textContent = String(state.rules.length)
    elements.alwaysRulesCount.textContent = String(alwaysCount)
    elements.timedRulesCount.textContent = String(timedCount)
  }

  function buildRuleNarrative(rule) {
    if (rule.subpageMode === SUBPAGE_MODES.WHITELIST) {
      return `Blocks ${rule.site} by default and keeps only the listed paths reachable.`
    }

    if (rule.subpageMode === SUBPAGE_MODES.BLACKLIST) {
      return `Keeps ${rule.site} open by default and blocks only the listed paths.`
    }

    return `Blocks the entire domain ${rule.site}.`
  }

  function getCoverageLabel(mode) {
    if (mode === SUBPAGE_MODES.WHITELIST) {
      return "Only allow listed paths"
    }

    if (mode === SUBPAGE_MODES.BLACKLIST) {
      return "Only block listed paths"
    }

    return "Whole domain"
  }

  function getCoverageCopy(rule) {
    if (rule.subpageMode === SUBPAGE_MODES.WHITELIST) {
      return "Everything else on the domain stays blocked."
    }

    if (rule.subpageMode === SUBPAGE_MODES.BLACKLIST) {
      return "Everything else on the domain stays available."
    }

    return "Every page on the domain is blocked."
  }

  function getPathCountLabel(rule) {
    if (rule.subpageMode === SUBPAGE_MODES.WHITELIST) {
      return `${rule.subpageWhitelist.length} allowed`
    }

    if (rule.subpageMode === SUBPAGE_MODES.BLACKLIST) {
      return `${rule.subpageBlacklist.length} blocked`
    }

    return "No path list"
  }

  function getPathPreviewCopy(rule) {
    const entries = getPathEntries(rule)

    if (entries.length === 0) {
      return "This rule does not depend on specific paths."
    }

    if (entries.length === 1) {
      return entries[0]
    }

    return `${entries[0]} and ${entries.length - 1} more`
  }

  function getPathEntries(rule) {
    if (rule.subpageMode === SUBPAGE_MODES.WHITELIST) {
      return rule.subpageWhitelist
    }

    if (rule.subpageMode === SUBPAGE_MODES.BLACKLIST) {
      return rule.subpageBlacklist
    }

    return []
  }
})
