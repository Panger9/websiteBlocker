document.addEventListener("DOMContentLoaded", () => {
  const {
    RULES_STORAGE_KEY,
    RULE_TYPES,
    SUBPAGE_MODES,
    normalizeRules,
    normalizeRule,
    validateRuleInput,
    validatePatternInput,
    formatDaysOfWeek,
  } = SiteBlockerRules

  const BLOCK_MODES = {
    ALL: "all",
    WHITELIST: "whitelist",
    BLACKLIST: "blacklist",
  }

  const FILTERS = {
    ALL: "all",
    ALWAYS: "always",
    TIMED: "timed",
  }

  const DEFAULT_TIMES = {
    start: "09:00",
    end: "17:00",
  }

  const DEFAULT_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"]
  const FEEDBACK_TOAST_DURATION_MS = 2200
  const FEEDBACK_TOAST_FADE_MS = 220

  const TEXT = {
    addTitle: "Add new site",
    editTitle: "Edit rule",
    addButton: "Add site",
    saveButton: "Save changes",
    ruleAdded: "Rule added successfully.",
    ruleUpdated: "Rule updated successfully.",
    loadError: "Saved rules could not be loaded.",
    formError: "Please review the highlighted fields.",
    saveError: "The rule could not be saved.",
    duplicatePath: "This path has already been added.",
    emptyFilter: "No rules in this filter.",
    noPaths: "No paths added yet.",
    removePath: "Remove path",
    domainFallback: "domain",
    modeAll: "The entire domain is blocked.",
    modeWhitelist: "Everything is blocked except the paths listed below.",
    modeBlacklist: "Everything is allowed except the paths listed below.",
    allowedPathsLabel: "Allowed paths",
    blockedPathsLabel: "Blocked paths",
    allowedPathsHelp:
      "These paths stay open. Everything else on this site is blocked.",
    blockedPathsHelp:
      "These paths are blocked. Everything else on this site stays open.",
    whitelistBlockedByBlacklist:
      "A blacklist rule already exists for this domain. Remove it before adding a whitelist rule.",
    blacklistBlockedByWhitelist:
      "A whitelist rule already exists for this domain. Remove it before adding a blacklist rule.",
  }

  const params = new URLSearchParams(window.location.search)
  const previewMode = params.get("preview") === "1"
  const previewState = params.get("state") || ""
  const storage = createStorageAdapter(previewMode)

  const elements = {
    blockedSitesCount: document.getElementById("blockedSitesCount"),
    filterButtons: Array.from(document.querySelectorAll("[data-filter]")),
    openComposerButton: document.getElementById("openComposer"),
    addEditorHost: document.getElementById("addEditorHost"),
    rulesList: document.getElementById("rulesList"),
    appVersion: document.getElementById("appVersion"),
    sharedEditor: document.getElementById("sharedEditor"),
    editorHeader: document.getElementById("editorHeader"),
    editorTitle: document.getElementById("editorTitle"),
    closeEditorButton: document.getElementById("closeEditor"),
    domainField: document.getElementById("domainField"),
    domainInput: document.getElementById("domainInput"),
    editorGrid: document.getElementById("editorGrid"),
    blockModeRadios: Array.from(document.querySelectorAll('input[name="blockMode"]')),
    modeDescription: document.getElementById("modeDescription"),
    modeHint: document.getElementById("modeHint"),
    typeRadios: Array.from(document.querySelectorAll('input[name="ruleType"]')),
    scheduleSection: document.getElementById("scheduleSection"),
    scheduleActiveContent: document.getElementById("scheduleActiveContent"),
    scheduleStaticCopy: document.getElementById("scheduleStaticCopy"),
    startTimeInput: document.getElementById("startTime"),
    endTimeInput: document.getElementById("endTime"),
    timeFields: Array.from(document.querySelectorAll(".compact-field")),
    dayButtons: Array.from(document.querySelectorAll(".day-chip")),
    pathsSection: document.getElementById("pathsSection"),
    pathsLabel: document.getElementById("pathsLabel"),
    pathsHelper: document.getElementById("pathsHelper"),
    patternList: document.getElementById("activePatterns"),
    patternInput: document.getElementById("patternInput"),
    addPatternButton: document.getElementById("addPatternButton"),
    saveButton: document.getElementById("saveRule"),
    siteError: document.getElementById("siteError"),
    scheduleError: document.getElementById("scheduleError"),
    subpageError: document.getElementById("subpageError"),
    formStatus: document.getElementById("formStatus"),
    deleteModal: document.getElementById("deleteModal"),
    deleteRuleLabel: document.getElementById("deleteRuleLabel"),
    cancelDeleteButton: document.getElementById("cancelDelete"),
    cancelDeleteIconButton: document.getElementById("cancelDeleteIcon"),
    confirmDeleteButton: document.getElementById("confirmDelete"),
    feedbackToast: document.getElementById("feedbackToast"),
    feedbackToastMessage: document.getElementById("feedbackToastMessage"),
  }

  const state = {
    rules: [],
    filter: FILTERS.ALL,
    editorPlacement: "closed",
    editingIndex: -1,
    editingHost: null,
    pendingDeleteIndex: -1,
    draft: createEmptyDraft(),
  }
  let feedbackHideTimer = 0
  let feedbackResetTimer = 0

  init()

  async function init() {
    applyVersion()
    bindEvents()
    await loadRules()
    applyPreviewState()
    render()
  }

  function applyVersion() {
    if (previewMode) {
      elements.appVersion.textContent = "v1.0.0"
      return
    }

    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
        elements.appVersion.textContent = `v${chrome.runtime.getManifest().version}`
        return
      }
    } catch (error) {
      // Ignore preview fallback.
    }

    elements.appVersion.textContent = "v1.0.1"
  }

  function createStorageAdapter(isPreview) {
    let memoryRules = createPreviewRules()

    if (!isPreview && typeof chrome !== "undefined" && chrome.storage?.local) {
      return {
        async getRules() {
          const result = await chrome.storage.local.get([RULES_STORAGE_KEY])
          return normalizeRules(result[RULES_STORAGE_KEY] || [])
        },
        async saveRules(rules) {
          const normalized = normalizeRules(rules)
          await chrome.storage.local.set({ [RULES_STORAGE_KEY]: normalized })

          chrome.runtime?.sendMessage?.({ type: "rulesUpdated" }, () => {
            if (chrome.runtime?.lastError) {
              console.warn(
                "Rule refresh message failed.",
                chrome.runtime.lastError.message
              )
            }
          })
        },
      }
    }

    return {
      async getRules() {
        return normalizeRules(memoryRules)
      },
      async saveRules(rules) {
        memoryRules = normalizeRules(rules)
      },
    }
  }

  function createPreviewRules() {
    return [
      {
        type: RULE_TYPES.TIMED,
        site: "youtube.com",
        startTime: DEFAULT_TIMES.start,
        endTime: DEFAULT_TIMES.end,
        daysOfWeek: [...DEFAULT_WEEKDAYS],
        subpageMode: SUBPAGE_MODES.BLACKLIST,
        subpageBlacklist: ["/shorts", "/feed"],
      },
      {
        type: RULE_TYPES.ALWAYS,
        site: "twitter.com",
        subpageMode: SUBPAGE_MODES.NONE,
      },
      {
        type: RULE_TYPES.ALWAYS,
        site: "reddit.com",
        subpageMode: SUBPAGE_MODES.WHITELIST,
        subpageWhitelist: ["/comments", "/r/programming"],
      },
    ]
  }

  function createEmptyDraft() {
    return {
      site: "",
      type: RULE_TYPES.ALWAYS,
      blockMode: BLOCK_MODES.ALL,
      startTime: DEFAULT_TIMES.start,
      endTime: DEFAULT_TIMES.end,
      daysOfWeek: [...DEFAULT_WEEKDAYS],
      whitelistPatterns: [],
      blacklistPatterns: [],
    }
  }

  function applyPreviewState() {
    if (previewState === "add") {
      openAddEditor()
      state.draft.type = RULE_TYPES.TIMED
      state.draft.blockMode = BLOCK_MODES.BLACKLIST
      state.draft.endTime = "14:00"
      return
    }

    if (previewState === "edit-blacklist") {
      const index = state.rules.findIndex((rule) => rule.site === "youtube.com")
      if (index >= 0) {
        openEditEditor(index)
      }
    }
  }

  function bindEvents() {
    elements.filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter || FILTERS.ALL
        render()
      })
    })

    elements.openComposerButton.addEventListener("click", () => {
      openAddEditor()
      render()
    })

    elements.closeEditorButton.addEventListener("click", () => {
      closeEditor()
      render()
    })

    elements.domainInput.addEventListener("input", () => {
      state.draft.site = elements.domainInput.value
      clearFieldError(elements.siteError)
      clearStatus()
      renderEditorState()
    })

    elements.blockModeRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        state.draft.blockMode = radio.value
        clearFieldError(elements.subpageError)
        clearStatus()
        renderEditorState()
      })
    })

    elements.typeRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        state.draft.type = radio.value
        clearFieldError(elements.scheduleError)
        clearStatus()
        renderEditorState()
      })
    })

    elements.startTimeInput.addEventListener("input", () => {
      state.draft.startTime = elements.startTimeInput.value
      clearFieldError(elements.scheduleError)
      clearStatus()
      renderEditorState()
    })

    elements.endTimeInput.addEventListener("input", () => {
      state.draft.endTime = elements.endTimeInput.value
      clearFieldError(elements.scheduleError)
      clearStatus()
      renderEditorState()
    })

    elements.dayButtons.forEach((button) => {
      button.addEventListener("click", () => {
        toggleDay(button.dataset.day || "")
      })
    })

    elements.timeFields.forEach((field) => {
      const input = field.querySelector('input[type="time"]')
      if (!input) {
        return
      }

      field.classList.add("is-time-picker")
      field.addEventListener("click", (event) => {
        if (event.target instanceof HTMLLabelElement) {
          return
        }

        openTimePicker(input)
      })
    })

    elements.addPatternButton.addEventListener("click", addActivePattern)
    elements.patternInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault()
        addActivePattern()
      }
    })

    elements.patternList.addEventListener("click", (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      const removeButton = target.closest("[data-remove-pattern]")
      if (!removeButton) {
        return
      }

      const pattern = removeButton.getAttribute("data-remove-pattern")
      if (pattern) {
        removePattern(pattern)
      }
    })

    elements.saveButton.addEventListener("click", async () => {
      await handleSubmit()
    })

    elements.cancelDeleteButton.addEventListener("click", closeDeleteModal)
    elements.cancelDeleteIconButton.addEventListener("click", closeDeleteModal)
    elements.confirmDeleteButton.addEventListener("click", async () => {
      await confirmDeleteRule()
    })
    elements.deleteModal.addEventListener("click", (event) => {
      if (event.target === elements.deleteModal) {
        closeDeleteModal()
      }
    })
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.deleteModal.hidden) {
        closeDeleteModal()
      }
    })
  }

  function openTimePicker(input) {
    if (typeof input.showPicker === "function") {
      input.showPicker()
      return
    }

    input.focus()
    input.click()
  }

  async function loadRules() {
    try {
      state.rules = normalizeRules(await storage.getRules())
    } catch (error) {
      console.error("Failed to load rules.", error)
      state.rules = []
      showStatus(TEXT.loadError, "error")
    }
  }

  async function persistRules() {
    state.rules = normalizeRules(state.rules)
    await storage.saveRules(state.rules)
  }

  function openAddEditor() {
    state.editorPlacement = "add"
    state.editingIndex = -1
    state.editingHost = null
    state.draft = createEmptyDraft()
    clearValidation()
    clearStatus()
  }

  function openEditEditor(index) {
    state.editorPlacement = "edit"
    state.editingIndex = index
    state.editingHost = null
    state.draft = ruleToDraft(state.rules[index])
    clearValidation()
    clearStatus()
  }

  function closeEditor() {
    state.editorPlacement = "closed"
    state.editingIndex = -1
    state.editingHost = null
    state.draft = createEmptyDraft()
    clearValidation()
    clearStatus()
    elements.sharedEditor.hidden = true
  }

  function ruleToDraft(rule) {
    const normalized = normalizeRule(rule)
    return {
      site: normalized.site,
      type: normalized.type,
      blockMode:
        normalized.subpageMode === SUBPAGE_MODES.WHITELIST
          ? BLOCK_MODES.WHITELIST
          : normalized.subpageMode === SUBPAGE_MODES.BLACKLIST
            ? BLOCK_MODES.BLACKLIST
            : BLOCK_MODES.ALL,
      startTime: normalized.startTime || DEFAULT_TIMES.start,
      endTime: normalized.endTime || DEFAULT_TIMES.end,
      daysOfWeek: [...normalized.daysOfWeek],
      whitelistPatterns: [...normalized.subpageWhitelist],
      blacklistPatterns: [...normalized.subpageBlacklist],
    }
  }

  function draftToRule() {
    return normalizeRule({
      type: state.draft.type,
      site: state.draft.site,
      startTime: state.draft.type === RULE_TYPES.TIMED ? state.draft.startTime : "",
      endTime: state.draft.type === RULE_TYPES.TIMED ? state.draft.endTime : "",
      daysOfWeek: state.draft.type === RULE_TYPES.TIMED ? state.draft.daysOfWeek : [],
      subpageMode: getDraftSubpageMode(),
      subpageWhitelist:
        state.draft.blockMode === BLOCK_MODES.WHITELIST
          ? state.draft.whitelistPatterns
          : [],
      subpageBlacklist:
        state.draft.blockMode === BLOCK_MODES.BLACKLIST
          ? state.draft.blacklistPatterns
          : [],
    })
  }

  function getDraftSubpageMode() {
    if (state.draft.blockMode === BLOCK_MODES.WHITELIST) {
      return SUBPAGE_MODES.WHITELIST
    }

    if (state.draft.blockMode === BLOCK_MODES.BLACKLIST) {
      return SUBPAGE_MODES.BLACKLIST
    }

    return SUBPAGE_MODES.NONE
  }

  async function handleSubmit() {
    clearValidation()
    clearStatus()
    const candidate = draftToRule()
    const validation = validateRuleInput(
      candidate,
      state.rules,
      state.editorPlacement === "edit" ? state.editingIndex : -1
    )

    if (!validation.valid) {
      renderValidation(validation.errors)
      showStatus(TEXT.formError, "error")
      return
    }

    const feedbackMessage =
      state.editorPlacement === "edit" ? TEXT.ruleUpdated : TEXT.ruleAdded

    if (state.editorPlacement === "edit") {
      state.rules[state.editingIndex] = validation.normalizedRule
    } else {
      state.rules.unshift(validation.normalizedRule)
    }

    try {
      await persistRules()
      closeEditor()
      render()
      showFeedbackToast(feedbackMessage)
    } catch (error) {
      console.error("Failed to save rules.", error)
      showStatus(TEXT.saveError, "error")
    }
  }

  function addActivePattern() {
    const validation = validatePatternInput(elements.patternInput.value)
    clearFieldError(elements.subpageError)
    clearStatus()

    if (!validation.valid) {
      setFieldError(elements.subpageError, validation.message)
      return
    }

    const targetList = getEditablePatternList()
    if (!targetList) {
      return
    }

    if (targetList.includes(validation.normalized)) {
      setFieldError(elements.subpageError, TEXT.duplicatePath)
      return
    }

    targetList.push(validation.normalized)
    elements.patternInput.value = ""
    renderEditorState()
  }

  function getEditablePatternList() {
    if (state.draft.blockMode === BLOCK_MODES.WHITELIST) {
      return state.draft.whitelistPatterns
    }

    if (state.draft.blockMode === BLOCK_MODES.BLACKLIST) {
      return state.draft.blacklistPatterns
    }

    return null
  }

  function removePattern(pattern) {
    if (state.draft.blockMode === BLOCK_MODES.WHITELIST) {
      state.draft.whitelistPatterns = state.draft.whitelistPatterns.filter(
        (entry) => entry !== pattern
      )
    }

    if (state.draft.blockMode === BLOCK_MODES.BLACKLIST) {
      state.draft.blacklistPatterns = state.draft.blacklistPatterns.filter(
        (entry) => entry !== pattern
      )
    }

    renderEditorState()
  }

  function toggleDay(dayKey) {
    const days = new Set(state.draft.daysOfWeek)
    if (days.has(dayKey)) {
      days.delete(dayKey)
    } else {
      days.add(dayKey)
    }

    state.draft.daysOfWeek = Array.from(days)
    renderEditorState()
  }

  function render() {
    renderFilters()
    renderAddEditorHost()
    renderRules()
    renderEditorState()
    renderDeleteModal()
    elements.blockedSitesCount.textContent = String(getUniqueSiteCount())
  }

  function getUniqueSiteCount() {
    return new Set(state.rules.map((rule) => rule.site)).size
  }

  function renderFilters() {
    elements.filterButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.filter === state.filter)
    })
  }

  function renderAddEditorHost() {
    elements.openComposerButton.hidden = state.editorPlacement === "add"
    elements.addEditorHost.hidden = state.editorPlacement !== "add"
  }

  function renderRules() {
    elements.rulesList.innerHTML = ""
    state.editingHost = null

    const visibleRules = state.rules.filter((rule) => ruleMatchesFilter(rule, state.filter))

    if (visibleRules.length === 0) {
      const empty = document.createElement("section")
      empty.className = "empty-state"
      const paragraph = document.createElement("p")
      paragraph.textContent = TEXT.emptyFilter
      empty.appendChild(paragraph)
      elements.rulesList.appendChild(empty)
      return
    }

    visibleRules.forEach((rule) => {
      const ruleIndex = state.rules.indexOf(rule)
      elements.rulesList.appendChild(createRuleCard(rule, ruleIndex))
    })
  }

  function ruleMatchesFilter(rule, filter) {
    if (filter === FILTERS.ALWAYS) {
      return rule.type === RULE_TYPES.ALWAYS
    }

    if (filter === FILTERS.TIMED) {
      return rule.type === RULE_TYPES.TIMED
    }

    return true
  }

  function createRuleCard(rule, ruleIndex) {
    const card = document.createElement("article")
    card.className = "rule-card"

    if (isEditingRule(ruleIndex)) {
      card.classList.add("is-expanded")
    }

    const header = document.createElement("div")
    header.className = "rule-header"

    const main = document.createElement("div")
    main.className = "rule-main"

    const icon = document.createElement("div")
    icon.className = `rule-icon rule-icon-${getBlockModeVariant(rule)}`
    icon.innerHTML = getRuleIconMarkup(rule)

    const copy = document.createElement("div")
    copy.className = "rule-copy"

    const topline = document.createElement("div")
    topline.className = "rule-topline"

    const domain = document.createElement("p")
    domain.className = "rule-domain"
    domain.textContent = rule.site

    const badge = document.createElement("span")
    badge.className = `rule-badge rule-badge-${getBlockModeVariant(rule)}`
    badge.textContent = getBlockModeLabel(rule)

    topline.append(domain, badge)

    if (rule.type === RULE_TYPES.TIMED) {
      const timeChip = document.createElement("span")
      timeChip.className = "rule-time-chip"
      timeChip.textContent = `${rule.startTime}-${rule.endTime}`
      topline.appendChild(timeChip)
    }

    copy.appendChild(topline)

    if (rule.type === RULE_TYPES.TIMED) {
      copy.appendChild(createRuleLine(formatDaysOfWeek(rule.daysOfWeek)))
    }

    const detailText = getRuleDetailText(rule)
    if (detailText) {
      copy.appendChild(createRuleLine(detailText))
    }

    main.append(icon, copy)

    const actions = document.createElement("div")
    actions.className = "rule-actions"

    const editButton = createRuleActionButton(
      renderSettingsIcon(),
      `Open rule for ${rule.site}`,
      async () => {
        if (isEditingRule(ruleIndex)) {
          closeEditor()
        } else {
          openEditEditor(ruleIndex)
        }
        render()
      }
    )

    if (isEditingRule(ruleIndex)) {
      editButton.classList.add("is-active")
    }

    const deleteButton = createRuleActionButton(
      renderTrashIcon(),
      `Delete rule for ${rule.site}`,
      async () => {
        openDeleteModal(ruleIndex)
      }
    )

    actions.append(editButton, deleteButton)
    header.append(main, actions)
    card.appendChild(header)

    if (isEditingRule(ruleIndex)) {
      const host = document.createElement("div")
      state.editingHost = host
      card.appendChild(host)
    }

    return card
  }

  function createRuleLine(text) {
    const line = document.createElement("p")
    line.className = "rule-line"
    line.textContent = text
    return line
  }

  function getRuleDetailText(rule) {
    const subpageCount = getPatternCount(rule)
    if (subpageCount === 0) {
      return ""
    }

    if (rule.subpageMode === SUBPAGE_MODES.WHITELIST) {
      return `${subpageCount} allowed path${subpageCount === 1 ? "" : "s"}`
    }

    return `${subpageCount} blocked path${subpageCount === 1 ? "" : "s"}`
  }

  function createRuleActionButton(iconMarkup, ariaLabel, onClick) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "rule-action"
    button.innerHTML = iconMarkup
    button.setAttribute("aria-label", ariaLabel)
    button.addEventListener("click", onClick)
    return button
  }

  async function removeRule(index) {
    state.rules = state.rules.filter((_, ruleIndex) => ruleIndex !== index)
    if (isEditingRule(index)) {
      closeEditor()
    }

    try {
      await persistRules()
      render()
    } catch (error) {
      console.error("Failed to remove rule.", error)
    }
  }

  function openDeleteModal(index) {
    state.pendingDeleteIndex = index
    renderDeleteModal()
  }

  function closeDeleteModal() {
    state.pendingDeleteIndex = -1
    renderDeleteModal()
  }

  async function confirmDeleteRule() {
    if (state.pendingDeleteIndex < 0) {
      return
    }

    const index = state.pendingDeleteIndex
    closeDeleteModal()
    await removeRule(index)
  }

  function renderDeleteModal() {
    const hasPendingDelete = state.pendingDeleteIndex >= 0
    elements.deleteModal.hidden = !hasPendingDelete

    if (!hasPendingDelete) {
      elements.deleteRuleLabel.textContent = ""
      return
    }

    const rule = state.rules[state.pendingDeleteIndex]
    if (!rule) {
      closeDeleteModal()
      return
    }

    elements.deleteRuleLabel.textContent = buildDeleteLabel(rule)
  }

  function buildDeleteLabel(rule) {
    const scope =
      rule.subpageMode === SUBPAGE_MODES.WHITELIST
        ? "Whitelist"
        : rule.subpageMode === SUBPAGE_MODES.BLACKLIST
          ? "Blacklist"
          : "Block all"

    if (rule.type === RULE_TYPES.TIMED) {
      return `${rule.site} • ${scope} • ${rule.startTime}-${rule.endTime}`
    }

    return `${rule.site} • ${scope}`
  }

  function isEditingRule(ruleIndex) {
    return state.editorPlacement === "edit" && state.editingIndex === ruleIndex
  }

  function renderEditorState() {
    if (state.editorPlacement === "closed") {
      elements.sharedEditor.hidden = true
      return
    }

    const targetHost =
      state.editorPlacement === "add" ? elements.addEditorHost : state.editingHost

    if (!targetHost) {
      return
    }

    if (elements.sharedEditor.parentElement !== targetHost) {
      targetHost.appendChild(elements.sharedEditor)
    }
    elements.sharedEditor.hidden = false
    elements.sharedEditor.classList.toggle("is-inline", state.editorPlacement === "edit")
    elements.editorHeader.hidden = state.editorPlacement === "edit"
    elements.domainField.hidden = state.editorPlacement === "edit"

    elements.editorTitle.textContent =
      state.editorPlacement === "add" ? TEXT.addTitle : TEXT.editTitle
    elements.saveButton.textContent =
      state.editorPlacement === "add" ? TEXT.addButton : TEXT.saveButton

    syncInputValue(elements.domainInput, state.draft.site)
    syncInputValue(elements.startTimeInput, state.draft.startTime)
    syncInputValue(elements.endTimeInput, state.draft.endTime)
    elements.scheduleSection.classList.toggle(
      "is-static",
      state.draft.type !== RULE_TYPES.TIMED
    )
    elements.scheduleActiveContent.hidden = state.draft.type !== RULE_TYPES.TIMED
    elements.scheduleStaticCopy.hidden = state.draft.type === RULE_TYPES.TIMED
    elements.editorGrid.classList.toggle(
      "is-balanced",
      state.draft.type === RULE_TYPES.TIMED
    )

    elements.blockModeRadios.forEach((radio) => {
      radio.checked = radio.value === state.draft.blockMode
    })

    elements.typeRadios.forEach((radio) => {
      radio.checked = radio.value === state.draft.type
    })

    elements.dayButtons.forEach((button) => {
      button.classList.toggle(
        "is-active",
        state.draft.daysOfWeek.includes(button.dataset.day || "")
      )
    })

    syncModeDescriptions()
    renderModeHint()
    renderPatternSection()
    updateSaveButtonState()
  }

  function syncInputValue(input, value) {
    if (document.activeElement === input) {
      return
    }

    if (input.value !== value) {
      input.value = value
    }
  }

  function syncModeDescriptions() {
    if (state.draft.blockMode === BLOCK_MODES.ALL) {
      elements.modeDescription.textContent = TEXT.modeAll
      return
    }

    if (state.draft.blockMode === BLOCK_MODES.WHITELIST) {
      elements.modeDescription.textContent = TEXT.modeWhitelist
      return
    }

    elements.modeDescription.textContent = TEXT.modeBlacklist
  }

  function renderModeHint() {
    const conflict = getModeConflictMessage()
    elements.modeHint.hidden = !conflict
    elements.modeHint.textContent = conflict || ""
  }

  function getModeConflictMessage() {
    const site = state.draft.site.trim()
    if (!site || state.draft.blockMode === BLOCK_MODES.ALL) {
      return ""
    }

    const conflictingMode = getExistingConflictingPathMode(
      site,
      state.editorPlacement === "edit" ? state.editingIndex : -1,
      getDraftSubpageMode()
    )

    if (conflictingMode === SUBPAGE_MODES.BLACKLIST) {
      return TEXT.whitelistBlockedByBlacklist
    }

    if (conflictingMode === SUBPAGE_MODES.WHITELIST) {
      return TEXT.blacklistBlockedByWhitelist
    }

    return ""
  }

  function getExistingConflictingPathMode(site, excludeIndex, draftMode) {
    if (draftMode === SUBPAGE_MODES.NONE) {
      return ""
    }

    const normalizedSite = normalizeRule({ site }).site
    if (!normalizedSite) {
      return ""
    }

    for (let index = 0; index < state.rules.length; index += 1) {
      if (index === excludeIndex) {
        continue
      }

      const rule = normalizeRule(state.rules[index])
      if (rule.site !== normalizedSite || rule.subpageMode === SUBPAGE_MODES.NONE) {
        continue
      }

      if (rule.subpageMode !== draftMode) {
        return rule.subpageMode
      }
    }

    return ""
  }

  function renderPatternSection() {
    const showPaths = state.draft.blockMode !== BLOCK_MODES.ALL
    const isWhitelist = state.draft.blockMode === BLOCK_MODES.WHITELIST
    const patterns = getActivePatterns()

    elements.pathsSection.hidden = !showPaths
    if (!showPaths) {
      return
    }

    elements.pathsLabel.textContent = isWhitelist
      ? TEXT.allowedPathsLabel
      : TEXT.blockedPathsLabel
    elements.pathsHelper.textContent = isWhitelist
      ? TEXT.allowedPathsHelp
      : TEXT.blockedPathsHelp
    elements.patternInput.placeholder = isWhitelist ? "/allowed-path" : "/path"

    elements.patternList.innerHTML = ""

    if (patterns.length === 0) {
      const empty = document.createElement("li")
      empty.className = "pattern-empty"
      empty.textContent = TEXT.noPaths
      elements.patternList.appendChild(empty)
      return
    }

    patterns.forEach((pattern) => {
      elements.patternList.appendChild(createPatternRow(pattern))
    })
  }

  function getActivePatterns() {
    if (state.draft.blockMode === BLOCK_MODES.WHITELIST) {
      return state.draft.whitelistPatterns
    }

    if (state.draft.blockMode === BLOCK_MODES.BLACKLIST) {
      return state.draft.blacklistPatterns
    }

    return []
  }

  function createPatternRow(pattern) {
    const item = document.createElement("li")
    item.className = "pattern-row"

    const copy = document.createElement("span")
    copy.className = "pattern-row-copy"

    const domain = document.createElement("span")
    domain.className = "pattern-domain"
    domain.textContent = state.draft.site || TEXT.domainFallback

    const path = document.createElement("span")
    path.className = "pattern-path"
    path.textContent = pattern

    const removeButton = document.createElement("button")
    removeButton.type = "button"
    removeButton.className = "pattern-remove"
    removeButton.dataset.removePattern = pattern
    removeButton.setAttribute("aria-label", TEXT.removePath)
    removeButton.textContent = "x"

    copy.append(domain, path)
    item.append(copy, removeButton)
    return item
  }

  function updateSaveButtonState() {
    const validation = validateRuleInput(
      draftToRule(),
      state.rules,
      state.editorPlacement === "edit" ? state.editingIndex : -1
    )
    elements.saveButton.disabled = !validation.valid
  }

  function getBlockModeVariant(rule) {
    if (rule.subpageMode === SUBPAGE_MODES.WHITELIST) {
      return "whitelist"
    }

    if (rule.subpageMode === SUBPAGE_MODES.BLACKLIST) {
      return "blacklist"
    }

    return "all"
  }

  function getBlockModeLabel(rule) {
    if (rule.subpageMode === SUBPAGE_MODES.WHITELIST) {
      return "Whitelist"
    }

    if (rule.subpageMode === SUBPAGE_MODES.BLACKLIST) {
      return "Blacklist"
    }

    return "All"
  }

  function getRuleIconMarkup(rule) {
    if (rule.subpageMode === SUBPAGE_MODES.WHITELIST) {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.6l6 2.5v5.1c0 4-2.6 7.5-6 9.2c-3.4-1.7-6-5.2-6-9.2V6.1l6-2.5Z"></path>
          <path d="m9.6 12.2l1.6 1.6l3.2-3.6"></path>
        </svg>
      `
    }

    if (rule.subpageMode === SUBPAGE_MODES.BLACKLIST) {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.6l6 2.5v5.1c0 4-2.6 7.5-6 9.2c-3.4-1.7-6-5.2-6-9.2V6.1l6-2.5Z"></path>
          <path d="M9 11h6"></path>
        </svg>
      `
    }

    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8"></circle>
        <path d="M8 8l8 8"></path>
      </svg>
    `
  }

  function getPatternCount(rule) {
    if (rule.subpageMode === SUBPAGE_MODES.WHITELIST) {
      return rule.subpageWhitelist.length
    }

    if (rule.subpageMode === SUBPAGE_MODES.BLACKLIST) {
      return rule.subpageBlacklist.length
    }

    return 0
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

  function showFeedbackToast(message) {
    window.clearTimeout(feedbackHideTimer)
    window.clearTimeout(feedbackResetTimer)

    elements.feedbackToastMessage.textContent = message
    elements.feedbackToast.hidden = false
    elements.feedbackToast.classList.remove("is-exiting")

    window.requestAnimationFrame(() => {
      elements.feedbackToast.classList.add("is-visible")
    })

    feedbackHideTimer = window.setTimeout(() => {
      hideFeedbackToast()
    }, FEEDBACK_TOAST_DURATION_MS)
  }

  function hideFeedbackToast() {
    if (elements.feedbackToast.hidden) {
      return
    }

    window.clearTimeout(feedbackHideTimer)
    elements.feedbackToast.classList.remove("is-visible")
    elements.feedbackToast.classList.add("is-exiting")

    feedbackResetTimer = window.setTimeout(() => {
      elements.feedbackToast.hidden = true
      elements.feedbackToast.classList.remove("is-exiting")
      elements.feedbackToastMessage.textContent = ""
    }, FEEDBACK_TOAST_FADE_MS)
  }

  function renderSettingsIcon() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 0 0 0-6.4Z"></path>
        <path d="M4.8 13.2v-2.4l2-.5c.2-.7.5-1.3.9-1.9l-1.1-1.8l1.7-1.7l1.8 1.1c.6-.4 1.2-.7 1.9-.9l.5-2h2.4l.5 2c.7.2 1.3.5 1.9.9l1.8-1.1l1.7 1.7l-1.1 1.8c.4.6.7 1.2.9 1.9l2 .5v2.4l-2 .5c-.2.7-.5 1.3-.9 1.9l1.1 1.8l-1.7 1.7l-1.8-1.1c-.6.4-1.2.7-1.9.9l-.5 2h-2.4l-.5-2a6.8 6.8 0 0 1-1.9-.9l-1.8 1.1l-1.7-1.7l1.1-1.8a6.8 6.8 0 0 1-.9-1.9l-2-.5Z"></path>
      </svg>
    `
  }

  function renderTrashIcon() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 7.5h15"></path>
        <path d="M9.5 3.75h5l.75 1.5h3.75"></path>
        <path d="M8 7.5v10.25c0 .83.67 1.5 1.5 1.5h5c.83 0 1.5-.67 1.5-1.5V7.5"></path>
        <path d="M10.5 10.5v5"></path>
        <path d="M13.5 10.5v5"></path>
      </svg>
    `
  }
})
