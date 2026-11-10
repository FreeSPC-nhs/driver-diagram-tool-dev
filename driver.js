// driver.js
// Core logic for the Driver Diagram Tool

var nodes = [];
var nextId = 1;
var connections = [];
var legendVisible = true;
var columnTitles = {
  aim: "Aim",
  primary: "Primary drivers",
  secondary: "Secondary drivers",
  change: "Change ideas"
};



// Diagram appearance settings (defaults)
var diagramAppearance = {
  boxHeight: 32,      // px
  verticalGap: 8,     // px between boxes
  fontSize: 13,       // px
  fontFamily: "",      // empty = inherit from page
  fontBold: false
};


// View state
var controlsVisible = true;
var tableVisible = false;

// --- Right-click context menu state ---
var nodeContextMenuEl = null;
var contextNodeId = null;
var nodeContextSubmenuEl = null; // NEW: holds the colour submenu element

// --- Auto-size measurement cache ---
// We must track the box height separately from the whole item height (box + measures),
// otherwise measures get counted twice and create extra gaps.
var measuredBoxHeightsById = {};   // height of the coloured box only
var measuredItemHeightsById = {};  // height of the whole wrapper (box + measures)
var suppressAutosizeRelayout = false;

// Level ordering for parent/child logic
var levelOrder = ["aim", "primary", "secondary", "change"];

// -------------------- Measures: types + colour coding --------------------
var measureTypes = [
  { value: "outcome",   label: "Outcome measure",   icon: "●", color: "#b91c1c" },
  { value: "process",   label: "Process measure",   icon: "●", color: "#15803d" },
  { value: "balancing", label: "Balancing measure", icon: "●", color: "#1d4ed8" },
  { value: "none",      label: "No type",           icon: "•", color: "#6b7280" }
];

function getMeasureTypeMeta(type) {
  var t = (type || "").toString().trim().toLowerCase();
  var found = measureTypes.find(function (m) { return m.value === t; });
  return found || measureTypes[measureTypes.length - 1]; // default "none"
}
// ------------------------------------------------------------------------

function getPreviousLevel(level) {
  var idx = levelOrder.indexOf(level);
  if (idx > 0) return levelOrder[idx - 1];
  return null;
}

function getNextLevel(level) {
  var idx = levelOrder.indexOf(level);
  if (idx >= 0 && idx < levelOrder.length - 1) return levelOrder[idx + 1];
  return null;
}

function createNode(options) {
  options = options || {};
  var id = options.id;
  var level = options.level;
  var text = options.text;
  var parentId = options.parentId || "";
  var color = options.color || "";

  if (id === undefined || id === null || id === "") {
    id = String(nextId++);
  }

  return {
    id: id,
    level: level,
    text: text,
    parentId: parentId,
    color: color,
    autoSize: options.autoSize == null ? true : !!options.autoSize,
    measures: Array.isArray(options.measures) ? options.measures : []
  };
}

function updateNextIdFromNodes() {
  if (nodes.length === 0) {
    nextId = 1;
    return;
  }
  var maxId = 0;
  nodes.forEach(function (n) {
    var numeric = parseInt(n.id, 10);
    if (!isNaN(numeric) && numeric > maxId) {
      maxId = numeric;
    }
  });
  nextId = maxId + 1;
}

function rebuildConnectionsFromParents() {
  // Use each node's parentId to reconstruct the baseline tree
  connections = [];
  nodes.forEach(function (n) {
    if (n.parentId) {
      connections.push({ fromId: n.parentId, toId: n.id });
    }
  });
}


function getMeasureTypeLabel(t) {
  return getMeasureTypeMeta(t).label;
}

function getMeasureTypeIcon(t) {
  return getMeasureTypeMeta(t).icon;
}

function addMeasureToNode(nodeId) {
  var n = nodes.find(function (x) { return x.id === nodeId; });
  if (!n) return;

  // ---- Build a small modal dialog ----
  var overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.right = "0";
  overlay.style.bottom = "0";
  overlay.style.background = "rgba(0,0,0,0.25)";
  overlay.style.zIndex = "20000";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) document.body.removeChild(overlay);
  });

  var dialog = document.createElement("div");
  dialog.style.width = "min(420px, calc(100vw - 24px))";
  dialog.style.background = "#fff";
  dialog.style.border = "1px solid #d0d7de";
  dialog.style.borderRadius = "12px";
  dialog.style.boxShadow = "0 14px 40px rgba(0,0,0,0.18)";
  dialog.style.padding = "14px";
  dialog.style.fontSize = "14px";
  dialog.style.color = "#111";
  dialog.addEventListener("click", function (e) { e.stopPropagation(); });

  var title = document.createElement("div");
  title.textContent = "Add measure";
  title.style.fontWeight = "700";
  title.style.marginBottom = "10px";
  dialog.appendChild(title);

  // Type row
  var typeRow = document.createElement("div");
  typeRow.style.display = "grid";
  typeRow.style.gridTemplateColumns = "120px 1fr";
  typeRow.style.gap = "10px";
  typeRow.style.alignItems = "center";
  typeRow.style.marginBottom = "10px";

  var typeLabel = document.createElement("div");
  typeLabel.textContent = "Measure type";
  typeLabel.style.color = "#374151";
  typeRow.appendChild(typeLabel);

  var typeSelect = document.createElement("select");
  typeSelect.style.padding = "8px 10px";
  typeSelect.style.borderRadius = "8px";
  typeSelect.style.border = "1px solid #d0d7de";
  typeSelect.style.fontSize = "14px";

  measureTypes.forEach(function (m) {
    var opt = document.createElement("option");
    opt.value = m.value;
    opt.textContent = m.label;
    typeSelect.appendChild(opt);
  });

  // default selection
  typeSelect.value = "process";
  typeRow.appendChild(typeSelect);

  dialog.appendChild(typeRow);

  // Text row
  var textRow = document.createElement("div");
  textRow.style.display = "grid";
  textRow.style.gridTemplateColumns = "120px 1fr";
  textRow.style.gap = "10px";
  textRow.style.alignItems = "start";
  textRow.style.marginBottom = "12px";

  var textLabel = document.createElement("div");
  textLabel.textContent = "Measure text";
  textLabel.style.color = "#374151";
  textRow.appendChild(textLabel);

  var textInput = document.createElement("textarea");
  textInput.rows = 3;
  textInput.placeholder = "e.g. Time to respond (within timeframe)";
  textInput.style.width = "100%";
  textInput.style.padding = "8px 10px";
  textInput.style.borderRadius = "8px";
  textInput.style.border = "1px solid #d0d7de";
  textInput.style.fontSize = "14px";
  textInput.style.resize = "vertical";
  textRow.appendChild(textInput);

  dialog.appendChild(textRow);

  // Buttons
  var btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.justifyContent = "flex-end";
  btnRow.style.gap = "8px";

  var cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.padding = "8px 12px";
  cancelBtn.style.borderRadius = "8px";
  cancelBtn.style.border = "1px solid #d0d7de";
  cancelBtn.style.background = "#fff";
  cancelBtn.style.color = "#111";   
  cancelBtn.style.cursor = "pointer";
  cancelBtn.addEventListener("click", function () {
    document.body.removeChild(overlay);
  });

  var addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "Add";
  addBtn.style.padding = "8px 12px";
  addBtn.style.borderRadius = "8px";
  addBtn.style.border = "1px solid #1f2937";
  addBtn.style.background = "#111";
  addBtn.style.color = "#fff";
  addBtn.style.cursor = "pointer";

  addBtn.addEventListener("click", function () {
    var type = (typeSelect.value || "none").toString().trim().toLowerCase();
    var text = (textInput.value || "").toString().trim();

    if (!text) {
      alert("Please enter some measure text.");
      return;
    }

    if (!Array.isArray(n.measures)) n.measures = [];
    n.measures.push({ type: type, text: text });

    // measures usually need space: turn on autoSize automatically
    n.autoSize = true;

    document.body.removeChild(overlay);
    updateAllViews();
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(addBtn);
  dialog.appendChild(btnRow);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Put cursor in the text box straight away
  setTimeout(function () { textInput.focus(); }, 0);

  // Allow Escape to close
  function escHandler(e) {
    if (e.key === "Escape") {
      if (overlay.parentNode) document.body.removeChild(overlay);
      document.removeEventListener("keydown", escHandler);
    }
  }
  document.addEventListener("keydown", escHandler);
}

function editMeasureOnNode(nodeId, measureIndex) {
  var n = nodes.find(function (x) { return x.id === nodeId; });
  if (!n) return;
  if (!Array.isArray(n.measures) || !n.measures.length) {
    alert("This item has no measures to edit.");
    return;
  }
  var m = n.measures[measureIndex];
  if (!m) return;

  // ---- Build a small modal dialog (same style as addMeasureToNode) ----
  var overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.right = "0";
  overlay.style.bottom = "0";
  overlay.style.background = "rgba(0,0,0,0.25)";
  overlay.style.zIndex = "20000";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) document.body.removeChild(overlay);
  });

  var dialog = document.createElement("div");
  dialog.style.width = "min(420px, calc(100vw - 24px))";
  dialog.style.background = "#fff";
  dialog.style.border = "1px solid #d0d7de";
  dialog.style.borderRadius = "12px";
  dialog.style.boxShadow = "0 14px 40px rgba(0,0,0,0.18)";
  dialog.style.padding = "14px";
  dialog.style.fontSize = "14px";
  dialog.style.color = "#111";
  dialog.addEventListener("click", function (e) { e.stopPropagation(); });

  var title = document.createElement("div");
  title.textContent = "Edit measure";
  title.style.fontWeight = "700";
  title.style.marginBottom = "10px";
  dialog.appendChild(title);

  // Type row
  var typeRow = document.createElement("div");
  typeRow.style.display = "grid";
  typeRow.style.gridTemplateColumns = "120px 1fr";
  typeRow.style.gap = "10px";
  typeRow.style.alignItems = "center";
  typeRow.style.marginBottom = "10px";

  var typeLabel = document.createElement("div");
  typeLabel.textContent = "Measure type";
  typeLabel.style.color = "#374151";
  typeRow.appendChild(typeLabel);

  var typeSelect = document.createElement("select");
  typeSelect.style.padding = "8px 10px";
  typeSelect.style.borderRadius = "8px";
  typeSelect.style.border = "1px solid #d0d7de";
  typeSelect.style.fontSize = "14px";

  measureTypes.forEach(function (mt) {
    var opt = document.createElement("option");
    opt.value = mt.value;
    opt.textContent = mt.label;
    typeSelect.appendChild(opt);
  });

  // default selection = current measure's type
  typeSelect.value = (m.type || "none").toString().trim().toLowerCase();
  typeRow.appendChild(typeSelect);
  dialog.appendChild(typeRow);

  // Text row
  var textRow = document.createElement("div");
  textRow.style.display = "grid";
  textRow.style.gridTemplateColumns = "120px 1fr";
  textRow.style.gap = "10px";
  textRow.style.alignItems = "start";
  textRow.style.marginBottom = "12px";

  var textLabel = document.createElement("div");
  textLabel.textContent = "Measure text";
  textLabel.style.color = "#374151";
  textRow.appendChild(textLabel);

  var textInput = document.createElement("textarea");
  textInput.rows = 3;
  textInput.style.width = "100%";
  textInput.style.padding = "8px 10px";
  textInput.style.borderRadius = "8px";
  textInput.style.border = "1px solid #d0d7de";
  textInput.style.fontSize = "14px";
  textInput.style.resize = "vertical";
  textInput.value = (m.text || "").toString();
  textRow.appendChild(textInput);

  dialog.appendChild(textRow);

  // Buttons
  var btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.justifyContent = "flex-end";
  btnRow.style.gap = "8px";

  var cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.padding = "8px 12px";
  cancelBtn.style.borderRadius = "8px";
  cancelBtn.style.border = "1px solid #d0d7de";
  cancelBtn.style.background = "#fff";
  cancelBtn.style.color = "#111";   
  cancelBtn.style.cursor = "pointer";
  cancelBtn.addEventListener("click", function () {
    document.body.removeChild(overlay);
  });

  var saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.style.padding = "8px 12px";
  saveBtn.style.borderRadius = "8px";
  saveBtn.style.border = "1px solid #1f2937";
  saveBtn.style.background = "#111";
  saveBtn.style.color = "#fff";
  saveBtn.style.cursor = "pointer";

  saveBtn.addEventListener("click", function () {
    var type = (typeSelect.value || "none").toString().trim().toLowerCase();
    var text = (textInput.value || "").toString().trim();

    if (!text) {
      alert("Please enter some measure text.");
      return;
    }

    m.type = type;
    m.text = text;

    document.body.removeChild(overlay);
    updateAllViews();
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);
  dialog.appendChild(btnRow);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  setTimeout(function () { textInput.focus(); }, 0);

  function escHandler(e) {
    if (e.key === "Escape") {
      if (overlay.parentNode) document.body.removeChild(overlay);
      document.removeEventListener("keydown", escHandler);
    }
  }
  document.addEventListener("keydown", escHandler);
}

function deleteMeasureOnNode(nodeId, measureIndex) {
  var n = nodes.find(function (x) { return x.id === nodeId; });
  if (!n) return;
  if (!Array.isArray(n.measures) || !n.measures.length) {
    alert("This item has no measures to delete.");
    return;
  }
  var m = n.measures[measureIndex];
  if (!m) return;

  var msg = "Delete this measure?\n\n" + (m.text || "");
  if (!window.confirm(msg)) return;

  n.measures.splice(measureIndex, 1);
  updateAllViews();
}

function clearMeasuresFromNode(nodeId) {
  var n = nodes.find(function (x) { return x.id === nodeId; });
  if (!n) return;
  if (!n.measures || !n.measures.length) return;

  if (!window.confirm("Remove all measures from this item?")) return;
  n.measures = [];
  updateAllViews();
}

function getLevelLabel(level) {
  if (level === "aim") return "Aim";
  if (level === "primary") return "Primary";
  if (level === "secondary") return "Secondary driver";
  if (level === "change") return "Change idea";
  return level;
}

/* ---------- Colour helpers ---------- */

// Colour options: { label, value } where value is a hex colour (e.g. "#ffcc00")
var colorOptions = [];

// Track which colour is being edited using a stable key (the hex value), not an array index
var editingColorValue = null;

// Default shown when adding a new colour
var defaultNewColorValue = "#fff7cc";

function findColorOptionByValue(value) {
  if (!value) return null;

  return colorOptions.find(function (option) {
    return (
      (option.value || "").toLowerCase() ===
      value.toLowerCase()
    );
  }) || null;
}

function getColorEditorElements() {
  return {
    title: document.getElementById("colorEditorTitle"),
    labelInput: document.getElementById("colorLabelInput"),
    valueInput: document.getElementById("colorValueInput"),
    saveButton: document.getElementById("addColorBtn"),
    cancelButton: document.getElementById("cancelColorEditBtn"),
    status: document.getElementById("colorEditStatus")
  };
}

function setColorEditorStatus(message, type) {
  var status = document.getElementById("colorEditStatus");
  if (!status) return;

  status.textContent = message || "";

  status.classList.remove(
    "is-warning",
    "is-success"
  );

  if (type === "warning") {
    status.classList.add("is-warning");
  }

  if (type === "success") {
    status.classList.add("is-success");
  }
}

function isColorEditorDirty() {
  if (!editingColorValue) return false;

  var elements = getColorEditorElements();
  var option = findColorOptionByValue(editingColorValue);

  if (
    !option ||
    !elements.labelInput ||
    !elements.valueInput
  ) {
    return false;
  }

  var currentLabel =
    (elements.labelInput.value || "").trim();

  var currentValue =
    (elements.valueInput.value || "").toLowerCase();

  return (
    currentLabel !== option.label ||
    currentValue !==
      (option.value || "").toLowerCase()
  );
}

function updateColorEditorUi() {
  var elements = getColorEditorElements();
  var option = findColorOptionByValue(editingColorValue);

  /*
    If the colour no longer exists, return safely to
    add mode.
  */
  if (editingColorValue && !option) {
    editingColorValue = null;
  }

  var isEditing = !!editingColorValue;

  if (elements.title) {
    elements.title.textContent = isEditing
      ? "Edit colour: " + option.label
      : "Add a new colour";
  }

  if (elements.saveButton) {
    elements.saveButton.textContent = isEditing
      ? "Save changes"
      : "Add colour";

    /*
      While editing, Save changes remains disabled until
      something has actually changed.
    */
    elements.saveButton.disabled =
      isEditing && !isColorEditorDirty();
  }

  if (elements.cancelButton) {
    elements.cancelButton.hidden = !isEditing;
  }
}

function handleColorEditorInput() {
  updateColorEditorUi();

  if (!editingColorValue) {
    setColorEditorStatus("");
    return;
  }

  var option = findColorOptionByValue(editingColorValue);

  if (isColorEditorDirty()) {
    setColorEditorStatus(
      "Unsaved changes",
      "warning"
    );
  } else if (option) {
    setColorEditorStatus(
      'Editing "' + option.label +
      '". Change the name or colour, then select Save changes.'
    );
  }
}

function resetColorEditorForm() {
  var elements = getColorEditorElements();

  editingColorValue = null;

  if (elements.labelInput) {
    elements.labelInput.value = "";
  }

  if (elements.valueInput) {
    elements.valueInput.value =
      defaultNewColorValue;
  }

  setColorEditorStatus("");
  updateColorEditorUi();
}

function beginColorEdit(value) {
  var option = findColorOptionByValue(value);
  if (!option) return;

  /*
    Protect unsaved work if the user selects Edit on a
    different colour.
  */
  if (
    editingColorValue &&
    editingColorValue.toLowerCase() !==
      value.toLowerCase() &&
    isColorEditorDirty()
  ) {
    var discard = window.confirm(
      "You have unsaved colour changes. " +
      "Discard them and edit another colour?"
    );

    if (!discard) return;
  }

  var elements = getColorEditorElements();

  editingColorValue = option.value;

  if (elements.labelInput) {
    elements.labelInput.value = option.label;
  }

  if (elements.valueInput) {
    elements.valueInput.value = option.value;
  }

  updateColorEditorUi();

  setColorEditorStatus(
    'Editing "' + option.label +
    '". Change the name or colour, then select Save changes.'
  );

  renderColorOptionsList();

  if (elements.labelInput) {
    elements.labelInput.focus();
    elements.labelInput.select();
  }
}

function cancelColorEdit() {
  resetColorEditorForm();
  renderColorOptionsList();

  setColorEditorStatus(
    "Editing cancelled."
  );
}

function initialiseColorEditor() {
  resetColorEditorForm();
  renderColorOptionsList();
}

function refreshColorSelect() {
  var select = document.getElementById("nodeColor");
  if (!select) return;

  var currentValue = select.value;

  select.innerHTML = "";
  var noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "No colour";
  select.appendChild(noneOption);

  colorOptions.forEach(function (opt) {
    var option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label + " (" + opt.value + ")";
    select.appendChild(option);
  });

  if (
    currentValue &&
    (currentValue === "" ||
      colorOptions.some(function (c) {
        return c.value === currentValue;
      }))
  ) {
    select.value = currentValue;
  }
}

function deleteColorOptionByValue(value) {
  if (!value) return;

  var option = findColorOptionByValue(value);
  if (!option) return;

  var usageCount = nodes.filter(function (node) {
    return (
      (node.color || "").toLowerCase() ===
      value.toLowerCase()
    );
  }).length;

  var message =
    'Delete the colour "' + option.label + '"?';

  if (usageCount > 0) {
    message +=
      "\n\nIt is currently used on " +
      usageCount +
      (usageCount === 1 ? " box." : " boxes.") +
      " Those boxes will return to having no colour.";
  }

  if (!window.confirm(message)) return;

  colorOptions = colorOptions.filter(function (item) {
    return (
      (item.value || "").toLowerCase() !==
      value.toLowerCase()
    );
  });

  nodes.forEach(function (node) {
    if (
      (node.color || "").toLowerCase() ===
      value.toLowerCase()
    ) {
      node.color = "";
    }
  });

  var deletedCurrentColour =
    editingColorValue &&
    editingColorValue.toLowerCase() ===
      value.toLowerCase();

  if (deletedCurrentColour) {
    resetColorEditorForm();
  }

  updateAllViews();

  setColorEditorStatus(
    'Colour "' + option.label + '" deleted.',
    "success"
  );
}

function renderColorOptionsList() {
  updateColorEditorUi();

  var list =
    document.getElementById("colorOptionsList");

  if (!list) return;

  list.innerHTML = "";

  if (colorOptions.length === 0) {
    var emptyItem = document.createElement("li");

    emptyItem.className =
      "colour-options-empty";

    emptyItem.textContent =
      "No colours have been added yet.";

    list.appendChild(emptyItem);
    return;
  }

  colorOptions.forEach(function (option) {
    var listItem =
      document.createElement("li");

    listItem.className =
      "colour-option-row";

    var isEditingThisColour =
      editingColorValue &&
      (option.value || "").toLowerCase() ===
        editingColorValue.toLowerCase();

    if (isEditingThisColour) {
      listItem.classList.add("is-editing");
    }

    var swatch =
      document.createElement("span");

    swatch.className =
      "colour-option-swatch";

    swatch.style.backgroundColor =
      option.value;

    swatch.title = option.value;

    var details =
      document.createElement("div");

    details.className =
      "colour-option-details";

    var name =
      document.createElement("span");

    name.className =
      "colour-option-name";

    name.textContent = option.label;

    var valueText =
      document.createElement("span");

    valueText.className =
      "colour-option-value";

    valueText.textContent = option.value;

    details.appendChild(name);
    details.appendChild(valueText);

    var actions =
      document.createElement("div");

    actions.className =
      "colour-option-actions";

    var editButton =
      document.createElement("button");

    editButton.type = "button";
    editButton.className =
      "colour-row-button";

    editButton.textContent =
      isEditingThisColour
        ? "Editing"
        : "Edit";

    editButton.disabled =
      !!isEditingThisColour;

    editButton.setAttribute(
      "aria-label",
      "Edit " + option.label
    );

    editButton.addEventListener(
      "click",
      function () {
        beginColorEdit(option.value);
      }
    );

    var deleteButton =
      document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className =
      "colour-row-button delete";

    deleteButton.textContent = "Delete";

    deleteButton.setAttribute(
      "aria-label",
      "Delete " + option.label
    );

    deleteButton.addEventListener(
      "click",
      function () {
        deleteColorOptionByValue(
          option.value
        );
      }
    );

    actions.appendChild(editButton);
    actions.appendChild(deleteButton);

    listItem.appendChild(swatch);
    listItem.appendChild(details);
    listItem.appendChild(actions);

    list.appendChild(listItem);
  });
}

function addColorOptionFromForm() {
  var labelInput =
    document.getElementById("colorLabelInput");

  var valueInput =
    document.getElementById("colorValueInput");

  if (!labelInput || !valueInput) return;

  var label =
    (labelInput.value || "").trim();

  var value =
    (valueInput.value || "")
      .trim()
      .toLowerCase();

  if (!label) {
    alert("Please enter a name for this colour.");
    labelInput.focus();
    return;
  }

  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    alert("Please choose a valid colour.");
    valueInput.focus();
    return;
  }

  var isEditing = !!editingColorValue;

  if (isEditing) {
    var oldValue = editingColorValue;
    var target =
      findColorOptionByValue(oldValue);

    if (!target) {
      alert(
        "The colour being edited could not be found. " +
        "Please select it again."
      );

      resetColorEditorForm();
      renderColorOptionsList();
      return;
    }

    /*
      Prevent two palette entries from having the same
      hex value. Nodes store the hex value, so duplicates
      would be ambiguous.
    */
    var duplicate = colorOptions.find(
      function (option) {
        return (
          (option.value || "").toLowerCase() ===
            value &&
          (option.value || "").toLowerCase() !==
            oldValue.toLowerCase()
        );
      }
    );

    if (duplicate) {
      alert(
        'That colour is already used by "' +
        duplicate.label +
        '". Please choose a different colour.'
      );

      valueInput.focus();
      return;
    }

    target.label = label;
    target.value = value;

    /*
      Update every box that used the old colour.
    */
    nodes.forEach(function (node) {
      if (
        (node.color || "").toLowerCase() ===
        oldValue.toLowerCase()
      ) {
        node.color = value;
      }
    });

    resetColorEditorForm();
    updateAllViews();

    setColorEditorStatus(
      'Colour "' + label + '" updated.',
      "success"
    );

    return;
  }

  /*
    Adding a new colour.
  */
  var existing =
    findColorOptionByValue(value);

  if (existing) {
    alert(
      'That colour is already in your list as "' +
      existing.label +
      '". Use its Edit button to change it.'
    );

    return;
  }

  colorOptions.push({
    label: label,
    value: value
  });

  resetColorEditorForm();
  updateAllViews();

  setColorEditorStatus(
    'Colour "' + label + '" added.',
    "success"
  );
}

// When importing CSV, we may see colour values that aren't in colorOptions yet.
// Build default labels like "Colour 1", "Colour 2", ...
function rebuildColorOptionsFromNodes() {
  var seen = {};
  nodes.forEach(function (n) {
    if (n.color) {
      seen[n.color] = true;
    }
  });

  colorOptions = [];
  var index = 1;
  for (var value in seen) {
    if (!seen.hasOwnProperty(value)) continue;
    colorOptions.push({
      label: "Colour " + index,
      value: value
    });
    index++;
  }

  resetColorEditorForm();
  refreshColorSelect();
  renderColorOptionsList();
}


// Convert hex colour to { r, g, b }
function hexToRgb(hex) {
  if (!hex) return null;
  var h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6) return null;

  var r = parseInt(h.slice(0, 2), 16);
  var g = parseInt(h.slice(2, 4), 16);
  var b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r: r, g: g, b: b };
}

// Choose black or white text for best contrast
function getContrastingTextColor(hex) {
  var rgb = hexToRgb(hex);
  if (!rgb) return "#000000";

  // perceived brightness
  var brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 130 ? "#000000" : "#ffffff";
}

function cycleNodeColor(node) {
  if (!colorOptions.length) {
    alert("No colour options defined yet. Add some colours on the left first.");
    return;
  }

  // Order: no colour (""), then each configured colour value
  var palette = [""].concat(
    colorOptions.map(function (c) {
      return c.value;
    })
  );

  var current = node.color || "";
  var currentIndex = palette.indexOf(current);
  if (currentIndex === -1) {
    currentIndex = 0;
  }

  var nextIndex = (currentIndex + 1) % palette.length;
  node.color = palette[nextIndex];

  updateAllViews();
}

/* ---------- Legend ---------- */

function renderLegend() {
  var list = document.getElementById("legendList");
  var keyList = document.getElementById("measureKeyList");
  var emptyMsg = document.getElementById("legendEmptyMessage");
  if (!list || !emptyMsg || !keyList) return;

  list.innerHTML = "";
  keyList.innerHTML = "";

  // Palette legend
  if (!colorOptions.length) {
    emptyMsg.style.display = "block";
  } else {
    emptyMsg.style.display = "none";
    colorOptions.forEach(function (opt) {
      var li = document.createElement("li");
      li.className = "legend-item";

      var swatch = document.createElement("span");
      swatch.className = "legend-color-swatch";
      swatch.style.backgroundColor = opt.value;

      var labelSpan = document.createElement("span");
      labelSpan.textContent = opt.label;

      li.appendChild(swatch);
      li.appendChild(labelSpan);
      list.appendChild(li);
    });
  }

  // Measures key (separate list)
  measureTypes.forEach(function (mt) {
    if (mt.value === "none") return;

    var li = document.createElement("li");
    li.className = "legend-item";

    var swatch = document.createElement("span");
    swatch.className = "legend-color-swatch";
    swatch.style.backgroundColor = mt.color;

    var labelSpan = document.createElement("span");
    labelSpan.textContent = mt.label;

    li.appendChild(swatch);
    li.appendChild(labelSpan);
    keyList.appendChild(li);
  });
}


/* ---------- Diagram rendering (boxes + connecting lines) ---------- */

function computeTreeLayout(byLevel, boxH, gap, heightById) {
  var aimNodes = byLevel.aim || [];
  var primaryNodes = byLevel.primary || [];
  var secondaryNodes = byLevel.secondary || [];
  var changeNodes = byLevel.change || [];

  // Build children maps in the CURRENT order of arrays (important)
  var secondariesByPrimary = {};
  secondaryNodes.forEach(function (s) {
    var pid = s.parentId || "";
    if (!secondariesByPrimary[pid]) secondariesByPrimary[pid] = [];
    secondariesByPrimary[pid].push(s);
  });

  var changesBySecondary = {};
  changeNodes.forEach(function (c) {
    var sid = c.parentId || "";
    if (!changesBySecondary[sid]) changesBySecondary[sid] = [];
    changesBySecondary[sid].push(c);
  });

function nodeH(id) {
  return (heightById && heightById[id]) ? heightById[id] : boxH;
}
  // Height required for a secondary branch (secondary + its changes)
  function secondaryBranchHeight(secId) {
    var kids = changesBySecondary[secId] || [];
    var secBoxH = nodeH(secId);
if (kids.length === 0) return secBoxH;

var sum = 0;
kids.forEach(function (k, i) {
  sum += nodeH(k.id);
  if (i < kids.length - 1) sum += gap;
});
return Math.max(secBoxH, sum);
  }

  // Height required for a primary branch (primary + all its secondary branches)
  function primaryBranchHeight(primaryId) {
    var secs = secondariesByPrimary[primaryId] || [];
    var pBoxH = nodeH(primaryId);
    if (secs.length === 0) return pBoxH;

    var sum = 0;
    secs.forEach(function (sec, i) {
      sum += secondaryBranchHeight(sec.id);
      if (i < secs.length - 1) sum += gap; // gap between secondary groups
    });

    return Math.max(pBoxH, sum);
  }

  // Compute overall diagram height by stacking primary branches
  var totalHeight = 0;
  if (primaryNodes.length === 0) {
    totalHeight = boxH;
  } else {
    primaryNodes.forEach(function (p, i) {
      totalHeight += primaryBranchHeight(p.id);
      if (i < primaryNodes.length - 1) totalHeight += gap; // gap between primary groups
    });
  }

  // Positions (top offsets) per node
  var topById = {};

  // Place Aim in the middle of the total height (if it exists)
  if (aimNodes.length) {
    topById[aimNodes[0].id] = Math.max(0, (totalHeight - nodeH(aimNodes[0].id)) / 2);
  }

  // Lay out primaries, and within each primary lay out its secondaries and changes
  var cursorY = 0;

  primaryNodes.forEach(function (p, pIndex) {
    var pHeight = primaryBranchHeight(p.id);

    // Primary box centred within its branch block
    topById[p.id] = cursorY + (pHeight - nodeH(p.id)) / 2;

    // Secondary blocks stacked within this primary block
    var secCursorY = cursorY;
    var secs = secondariesByPrimary[p.id] || [];

    secs.forEach(function (sec, sIndex) {
      var secH = secondaryBranchHeight(sec.id);

      // Secondary box centred within its own block
      topById[sec.id] = secCursorY + (secH - nodeH(sec.id)) / 2;

      // Change ideas stacked within the secondary block, starting at the top of the block
      var changes = changesBySecondary[sec.id] || [];
      var chCursorY = secCursorY;
      changes.forEach(function (ch, chIndex) {
        topById[ch.id] = chCursorY;
        chCursorY += nodeH(ch.id) + gap;
      });

      secCursorY += secH;
      if (sIndex < secs.length - 1) secCursorY += gap;
    });

    cursorY += pHeight;
    if (pIndex < primaryNodes.length - 1) cursorY += gap;
  });

  // Any unparented secondaries/changes (rare) — just place them at the bottom
  // so they remain visible rather than overlapping at 0.
  var fallbackY = totalHeight + gap;
  secondaryNodes.forEach(function (s) {
    if (topById[s.id] == null) {
      topById[s.id] = fallbackY;
      fallbackY += boxH + gap;
    }
  });
  changeNodes.forEach(function (c) {
    if (topById[c.id] == null) {
      topById[c.id] = fallbackY;
      fallbackY += boxH + gap;
    }
  });

  // If we used fallback rows, extend total height
  totalHeight = Math.max(totalHeight, fallbackY);

  return { topById: topById, totalHeight: totalHeight };
}

function estimateAutoHeightPx(text, fontSizePx, boxWidthPx, baseBoxHeightPx) {
  // Rough-but-good estimate of wrapping height without measuring DOM.
  // Works well for predictable UI + monos-ish average widths.
  if (!text) return baseBoxHeightPx;

  var paddingY = 10;              // adjust if your node padding differs
  var lineHeight = Math.round(fontSizePx * 1.25);

  // average character width ~0.55–0.6 of font size for typical fonts
  var avgCharW = fontSizePx * 0.58;

  // subtract space for icons/buttons/badge etc.
  var usableW = Math.max(80, boxWidthPx - 60);

  var charsPerLine = Math.max(10, Math.floor(usableW / avgCharW));
  var lines = Math.ceil(text.length / charsPerLine);

  var h = paddingY + lines * lineHeight + paddingY;
  return Math.max(baseBoxHeightPx, h);
}

function estimateMeasuresHeightPx(measures, fontSizePx) {
  if (!measures || !measures.length) return 0;

  var lineH = Math.round(fontSizePx * 1.2);
  var padTop = 6;
  var padBottom = 2;

  // assume each measure takes ~1 line (good enough; we’ll measure for real after render)
  return padTop + measures.length * lineH + padBottom;
}

function renderDiagram() {
  var canvas = document.getElementById("diagramCanvas");
  var columnsContainer = document.getElementById("diagramColumns");
  var svg = document.getElementById("diagramConnections");
  if (!canvas || !columnsContainer || !svg) return;

// Prevent the browser context menu anywhere inside the diagram area
[canvas, columnsContainer, svg].forEach(function (el) {
  el.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });
});

  // Clear columns
  columnsContainer.innerHTML = "";

  var levels = levelOrder.slice();
  

  // Group nodes by level
  var byLevel = {};
  levels.forEach(function (level) {
    byLevel[level] = nodes.filter(function (n) {
      return n.level === level;
    });
  });

// --- NEW: compute a tree-style layout so branches stay aligned ---
var boxH = (diagramAppearance && diagramAppearance.boxHeight) ? diagramAppearance.boxHeight : 32;
var gap = (diagramAppearance && diagramAppearance.verticalGap != null) ? diagramAppearance.verticalGap : 8;

var boxH = diagramAppearance && diagramAppearance.boxHeight ? diagramAppearance.boxHeight : 32;
var gap = diagramAppearance && diagramAppearance.verticalGap != null ? diagramAppearance.verticalGap : 8;
var fs  = diagramAppearance && diagramAppearance.fontSize ? diagramAppearance.fontSize : 13;

// We need an estimate of the inner width available for text.
// Use the column stack width if available; fall back to a sensible number.
var heightById = {};
nodes.forEach(function (n) {


// B1.2: Give the temporary inline editor enough room.
if (activeDiagramTextEdit &&
    activeDiagramTextEdit.id === n.id) {

  var editMeasuresFont = Math.max(10, fs - 3);

  heightById[n.id] = Math.max(
    measuredItemHeightsById[n.id] || 0,
    96 + estimateMeasuresHeightPx(
      n.measures,
      editMeasuresFont
    )
  );

  return;
}


  // If we already measured the whole wrapper (box + measures), use that.
  if (measuredItemHeightsById && measuredItemHeightsById[n.id]) {
    heightById[n.id] = measuredItemHeightsById[n.id];
    return;
  }

  // Otherwise estimate:
  // 1) coloured box height
  var boxHeightForThisNode;
  if (n.autoSize) {
    if (measuredBoxHeightsById && measuredBoxHeightsById[n.id]) {
      boxHeightForThisNode = measuredBoxHeightsById[n.id];
    } else {
      boxHeightForThisNode = estimateAutoHeightPx((n.text || ""), fs, 320, boxH);
    }
  } else {
    boxHeightForThisNode = boxH;
  }

  // 2) measures height (white space below box)
  var measuresFont = Math.max(10, fs - 3);
  var measuresHeightForThisNode = estimateMeasuresHeightPx(n.measures, measuresFont);

  heightById[n.id] = boxHeightForThisNode + measuresHeightForThisNode;
});

var layout = computeTreeLayout(byLevel, boxH, gap, heightById);

// Make sure the canvas is tall enough to contain absolutely-positioned nodes
canvas.style.minHeight = Math.ceil(layout.totalHeight + gap * 2) + "px";

// --- NEW: Keep change ideas visually aligned with their parent secondary driver ---
// Build a stable "node order" index (current order in the nodes array)
var nodeIndexById = {};
nodes.forEach(function (n, i) {
  nodeIndexById[n.id] = i;
});

// Build an order index for secondary drivers as they appear in the secondary column
var secondaryOrderById = {};
(byLevel.secondary || []).forEach(function (n, i) {
  secondaryOrderById[n.id] = i;
});

// Sort change ideas by their parent secondary driver's position.
// Tie-break within the same parent using the nodes-array order (stable).
if (byLevel.change && byLevel.change.length) {
  byLevel.change.sort(function (a, b) {
    var ai = (a.parentId && secondaryOrderById.hasOwnProperty(a.parentId))
      ? secondaryOrderById[a.parentId]
      : 999999;
    var bi = (b.parentId && secondaryOrderById.hasOwnProperty(b.parentId))
      ? secondaryOrderById[b.parentId]
      : 999999;

    if (ai !== bi) return ai - bi;

    // same parent secondary (or both missing): keep insertion order
    return (nodeIndexById[a.id] || 0) - (nodeIndexById[b.id] || 0);
  });
}

  // Build columns
  levels.forEach(function (level) {
    var col = document.createElement("div");
    col.className = "diagram-column";
    if (level === "aim") {
      col.classList.add("aim-column");
    }

    var title = document.createElement("div");
    title.className = "diagram-column-title";
    title.textContent = columnTitles[level] || "";
title.title = "Click to edit this heading";
title.style.cursor = "pointer";
title.tabIndex = 0;

title.addEventListener("click", function (e) {
  e.stopPropagation();
  var current = columnTitles[level] || "";
  var next = window.prompt("Edit heading:", current);
  if (next === null) return;
  columnTitles[level] = next.trim() || current;
  updateAllViews();
});

// optional: Enter key edits too
title.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    title.click();
  }
});
    col.appendChild(title);

    var stack = document.createElement("div");
    stack.className = "diagram-column-stack";
    col.appendChild(stack);
    
    // --- NEW: tree layout uses absolute positioning, not flex distribution ---
stack.style.justifyContent = "flex-start";
stack.style.paddingTop = "0px";
stack.style.paddingBottom = "0px";
stack.style.position = "relative";
stack.style.height = Math.ceil(layout.totalHeight) + "px";

    byLevel[level].forEach(function (node) {
      // -------------- Wrapper (absolute position) --------------
var item = document.createElement("div");
item.className = "diagram-item";
item.setAttribute("data-id", node.id);

item.style.position = "absolute";
item.style.top = (layout.topById[node.id] != null ? layout.topById[node.id] : 0) + "px";
item.style.left = "0px";
item.style.right = "0px";

// Right-click context menu (attach to wrapper so it works on measures too)
item.addEventListener("contextmenu", function (e) {
  e.preventDefault();
  e.stopPropagation();
  openNodeContextMenu(node.id, e.clientX, e.clientY);
});

// -------------- The coloured node box (NOT absolute) --------------
var box = document.createElement("div");
box.className = "diagram-node level-" + level;
box.style.whiteSpace = "normal";
box.style.wordBreak = "break-word";
box.style.overflowWrap = "anywhere";
box.setAttribute("data-id", node.id);


/* B1.2: Select a diagram element */

box.tabIndex = 0;
box.setAttribute("role", "group");
box.setAttribute(
  "aria-label",
  getLevelLabel(level) + ": " + node.text
);

if (selectedDiagramNodeId === node.id) {
  box.classList.add("diagram-selected");
}


box.addEventListener("click", function (e) {
  if (e.target.closest("button, textarea")) return;
  selectDiagramNode(node.id);
});

// Double-click to start editing directly in the box.
box.addEventListener("dblclick", function (e) {
  if (e.target.closest("button, textarea")) return;
  if (activeDiagramTextEdit) return;

  e.preventDefault();
  editNode(node.id);
});

// Keyboard support for selection and deselection.
box.addEventListener("keydown", function (e) {
  if (e.target !== box) return;

  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    selectDiagramNode(node.id);
  }
});


// IMPORTANT: box is no longer absolute-positioned
box.style.position = "relative";

// Apply appearance settings
if (diagramAppearance) {
  var baseH = diagramAppearance.boxHeight + "px";
  box.style.minHeight = baseH;

  // Only autoSize affects the coloured box height now
  if (node.autoSize) {
    box.style.height = "auto";
  } else {
    box.style.height = baseH;
  }

  box.style.fontSize = diagramAppearance.fontSize + "px";
  if (diagramAppearance.fontFamily) {
    box.style.fontFamily = diagramAppearance.fontFamily;
  } else {
    box.style.fontFamily = ""; // inherit
  }
  box.style.fontWeight = diagramAppearance.fontBold ? "700" : "400";
}

// Apply colour fill if set
if (node.color) {
  box.style.backgroundColor = node.color;
  box.style.borderColor = "#999";
  box.style.color = getContrastingTextColor(node.color);
} else {
  box.style.backgroundColor = "#ffffff";
  box.style.borderColor = "#d0d7de";
  box.style.color = "#000000";
}

// Add buttons for parent/child
var prevLevel = getPreviousLevel(level);
var nextLevel = getNextLevel(level);

if (prevLevel && level !== "primary") {
  var leftBtn = document.createElement("button");
  leftBtn.type = "button";
  leftBtn.className = "diagram-add diagram-add-left";

  if (diagramAppearance && diagramAppearance.boxHeight) {
    var h = diagramAppearance.boxHeight;
    leftBtn.style.height = h + "px";
    leftBtn.style.width = Math.round(h * 0.6) + "px";
    leftBtn.style.borderRadius = (h / 2) + "px";
    leftBtn.style.left = -(h / 2) + "px";
  }

  if (node.color) {
    leftBtn.style.backgroundColor = node.color;
    leftBtn.style.borderColor = node.color;
    leftBtn.style.color = getContrastingTextColor(node.color);
  } else {
    leftBtn.style.backgroundColor = "#ffffff";
    leftBtn.style.borderColor = "#d0d7de";
    leftBtn.style.color = "#555";
  }

  leftBtn.textContent = "📌";
  leftBtn.title = "Add or remove a connection to a " + getLevelLabel(prevLevel);
  leftBtn.setAttribute("aria-label", "Add or remove connection to " + getLevelLabel(prevLevel));

  leftBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    handleConnectionButtonClick(node.id);
  });

  box.appendChild(leftBtn);
}

if (nextLevel) {
  var rightBtn = document.createElement("button");
  rightBtn.type = "button";
  rightBtn.className = "diagram-add diagram-add-right";

  if (diagramAppearance && diagramAppearance.boxHeight) {
    var h2 = diagramAppearance.boxHeight;
    rightBtn.style.height = h2 + "px";
    rightBtn.style.width = Math.round(h2 * 0.6) + "px";
    rightBtn.style.borderRadius = (h2 / 2) + "px";
    rightBtn.style.right = -(h2 / 2) + "px";
  }

  if (node.color) {
    rightBtn.style.backgroundColor = node.color;
    rightBtn.style.borderColor = node.color;
    rightBtn.style.color = getContrastingTextColor(node.color);
  } else {
    rightBtn.style.backgroundColor = "#ffffff";
    rightBtn.style.borderColor = "#d0d7de";
    rightBtn.style.color = "#555";
  }

  rightBtn.textContent = "+";
  rightBtn.title = "Add " + getLevelLabel(nextLevel) + " (child)";
  rightBtn.setAttribute("aria-label", "Add child " + getLevelLabel(nextLevel));

  rightBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    addChildForNode(node.id);
  });

  box.appendChild(rightBtn);
}


// B1.3: Contextual pencil for editing selected boxes.
var pencilBtn = document.createElement("button");
pencilBtn.type = "button";
pencilBtn.className = "diagram-edit-pencil";
pencilBtn.title = "Edit text";
pencilBtn.setAttribute(
  "aria-label",
  "Edit text for " + node.text
);

pencilBtn.innerHTML =
  '<svg viewBox="0 0 24 24" width="15" height="15" ' +
  'fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" ' +
  'aria-hidden="true" focusable="false">' +
  '<path d="M12 20h9"/>' +
  '<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3' +
  'L7 19l-4 1 1-4Z"/>' +
  '</svg>';

pencilBtn.addEventListener("click", function (e) {
  e.stopPropagation();
  editNode(node.id);
});

box.appendChild(pencilBtn);


/* B1.2: Display text or an inline editor */

if (activeDiagramTextEdit &&
    activeDiagramTextEdit.id === node.id) {

  box.classList.add("diagram-text-editing");
  box.style.height = "auto";

  var inlineInput = document.createElement("textarea");
  inlineInput.id = "diagramInlineText";
  inlineInput.className = "diagram-inline-text";
  inlineInput.rows = 3;
  inlineInput.value = activeDiagramTextEdit.draft;

  inlineInput.setAttribute(
    "aria-label",
    "Edit " + getLevelLabel(node.level) + " text"
  );

  inlineInput.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  inlineInput.addEventListener("input", function () {
    activeDiagramTextEdit.draft = inlineInput.value;

    document.getElementById(
      "diagramEditFeedback"
    ).textContent =
      "Editing inside the box. Ctrl+Enter to save; Escape to cancel.";
  });

  inlineInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelDiagramInlineText();
    } else if (
      e.key === "Enter" && (e.ctrlKey || e.metaKey)
    ) {
      e.preventDefault();
      e.stopPropagation();
      saveDiagramInlineText();
    }
  });

  box.appendChild(inlineInput);

} else {

  var textSpan = document.createElement("span");
  textSpan.className = "diagram-node-text";
  textSpan.textContent = node.text;
  box.appendChild(textSpan);

}

// Put the coloured box into the wrapper
item.appendChild(box);

// -------------- Measures BELOW the box (white space) --------------
if (node.measures && node.measures.length) {
  var measuresWrap = document.createElement("div");
  measuresWrap.className = "diagram-measures-outside";
  measuresWrap.style.marginTop = "6px";
  measuresWrap.style.fontSize = Math.max(10, (diagramAppearance.fontSize || 13) - 3) + "px";
  measuresWrap.style.lineHeight = "1.2";
  measuresWrap.style.color = "#111";
  measuresWrap.style.background = "transparent";

  node.measures.forEach(function (m) {
    var row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "6px";
    row.style.alignItems = "flex-start";

    var meta = getMeasureTypeMeta((m && m.type) || "");

    var icon = document.createElement("span");
    icon.textContent = meta.icon;
    icon.style.marginTop = "1px";
    icon.style.color = meta.color;
    icon.title = meta.label;

    var txt = document.createElement("span");
    txt.textContent = (m && m.text) ? m.text : "";

    row.appendChild(icon);
    row.appendChild(txt);
    measuresWrap.appendChild(row);
  });

  item.appendChild(measuresWrap);
}

// Finally add the wrapper to the stack
stack.appendChild(item);
    });

    columnsContainer.appendChild(col);
  });

  // Draw connecting lines after layout has happened
if (!window.requestAnimationFrame) {
  drawConnections(canvas, svg);
} else {
  window.requestAnimationFrame(function () {
    // Measure actual auto-sized node heights and re-layout once if needed
    if (!suppressAutosizeRelayout) {
      var changed = false;

      nodes.forEach(function (n) {
  // We only need to measure if:
  // - autoSize is on (box can change height), OR
  // - measures exist (wrapper can change height)
  if (!n.autoSize && !(n.measures && n.measures.length)) return;

  var itemEl = canvas.querySelector('.diagram-item[data-id="' + n.id + '"]');
  if (!itemEl) return;

  var boxEl = itemEl.querySelector('.diagram-node[data-id="' + n.id + '"]');
  if (!boxEl) return;

  // Measure coloured box height (text wrapping etc.)
  var boxHReal = boxEl.offsetHeight;

  // Measure wrapper height (box + measures underneath)
  var itemHReal = itemEl.offsetHeight;

  // Clamp to at least the global base box height
  var minH =
    (diagramAppearance && diagramAppearance.boxHeight)
      ? diagramAppearance.boxHeight
      : 32;

  if (boxHReal < minH) boxHReal = minH;
  if (itemHReal < minH) itemHReal = minH;

  var boxChanged = (measuredBoxHeightsById[n.id] !== boxHReal);
  var itemChanged = (measuredItemHeightsById[n.id] !== itemHReal);

  if (boxChanged) measuredBoxHeightsById[n.id] = boxHReal;
  if (itemChanged) measuredItemHeightsById[n.id] = itemHReal;

  if (boxChanged || itemChanged) changed = true;
});

      // If anything changed, run a second render using measured heights
      if (changed) {
        suppressAutosizeRelayout = true;
        updateAllViews(); // will re-render diagram + re-run this block
        suppressAutosizeRelayout = false;
        return; // don't draw connections now; next render will do it
      }
    }

    // If no re-layout needed, just draw the connections
    drawConnections(canvas, svg);
  });
}
}

function drawConnections(canvas, svg) {
  var canvasRect = canvas.getBoundingClientRect();

  // Clear previous lines
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  var w = canvasRect.width;
  var h = canvasRect.height;

  svg.setAttribute("width", w);
  svg.setAttribute("height", h);
  // NEW: ensure the SVG coordinate system matches what we draw
  svg.setAttribute("viewBox", "0 0 " + w + " " + h);



  connections.forEach(function (conn) {
    var parentEl = canvas.querySelector(
      '.diagram-node[data-id="' + conn.fromId + '"]'
    );
    var childEl = canvas.querySelector(
      '.diagram-node[data-id="' + conn.toId + '"]'
    );
    if (!parentEl || !childEl) return;

    var parentRect = parentEl.getBoundingClientRect();
    var childRect = childEl.getBoundingClientRect();

    var x1 = parentRect.right - canvasRect.left;
    var y1 = parentRect.top + parentRect.height / 2 - canvasRect.top;
    var x2 = childRect.left - canvasRect.left;
    var y2 = childRect.top + childRect.height / 2 - canvasRect.top;

    var midX = (x1 + x2) / 2;

    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    var d =
      "M " +
      x1 +
      " " +
      y1 +
      " C " +
      midX +
      " " +
      y1 +
      ", " +
      midX +
      " " +
      y2 +
      ", " +
      x2 +
      " " +
      y2;

    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#666");
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-linecap", "round");

    svg.appendChild(path);
  });

}

/* ---------- Form helpers & table ---------- */

function refreshParentOptions() {
  var parentSelect = document.getElementById("nodeParent");
  if (!parentSelect) return;

  var currentValue = parentSelect.value;

  parentSelect.innerHTML = "";
  var noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "— None / top level —";
  parentSelect.appendChild(noneOption);

  nodes.forEach(function (node) {
    var opt = document.createElement("option");
    opt.value = node.id;
    var shortText =
      node.text.length > 50 ? node.text.slice(0, 47) + "…" : node.text;
    opt.textContent =
      "[" + node.id + "] " + getLevelLabel(node.level) + " – " + shortText;
    parentSelect.appendChild(opt);
  });

  if (
    currentValue &&
    nodes.some(function (n) {
      return n.id === currentValue;
    })
  ) {
    parentSelect.value = currentValue;
  }
}

function createColorSelectForNode(node) {
  var select = document.createElement("select");
  select.style.fontSize = "0.8rem";
  select.style.padding = "0.2rem 0.3rem";

  var noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "No colour";
  select.appendChild(noneOpt);

  colorOptions.forEach(function (opt) {
    var o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  });

  if (node.color) {
    var found = colorOptions.some(function (c) {
      return c.value === node.color;
    });
    if (!found) {
      var customOpt = document.createElement("option");
      customOpt.value = node.color;
      customOpt.textContent = "Custom (" + node.color + ")";
      select.appendChild(customOpt);
    }
  }

  select.value = node.color || "";

  select.addEventListener("change", function () {
    node.color = select.value;
    updateAllViews();
  });

  return select;
}

// --- Manual reordering helpers (reorders within same parentId + same level) ---
function getSiblingIdsInOrder(node) {
  var pid = node.parentId || "";
  var lvl = node.level;
  return nodes
    .filter(function (n) { return (n.parentId || "") === pid && n.level === lvl; })
    .map(function (n) { return n.id; });
}

function moveNodeWithinSiblings(nodeId, direction) {
  var node = nodes.find(function (n) { return n.id === nodeId; });
  if (!node) return;

  var pid = node.parentId || "";
  var lvl = node.level;

  // Indices of siblings in the nodes[] array, in current order
  var siblingIndexes = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if ((n.parentId || "") === pid && n.level === lvl) siblingIndexes.push(i);
  }
  if (siblingIndexes.length <= 1) return;

  var fromIndex = nodes.findIndex(function (n) { return n.id === nodeId; });
  var sibPos = siblingIndexes.indexOf(fromIndex);
  if (sibPos === -1) return;

  var targetSibPos = sibPos;
  if (direction === "up") targetSibPos = Math.max(0, sibPos - 1);
  else if (direction === "down") targetSibPos = Math.min(siblingIndexes.length - 1, sibPos + 1);
  else if (direction === "top") targetSibPos = 0;
  else if (direction === "bottom") targetSibPos = siblingIndexes.length - 1;

  if (targetSibPos === sibPos) return;

  var targetIndex = siblingIndexes[targetSibPos];

  // Remove the node from its current index
  var removed = nodes.splice(fromIndex, 1)[0];

  // If moving down/bottom, we want it to land AFTER the target sibling.
  // After removal, indices may shift, so recompute an insertion index carefully.
  var insertIndex;

  if (direction === "down" || direction === "bottom") {
    // After removal, if the target was after the removed node, it shifts left by 1
    if (targetIndex > fromIndex) targetIndex--;
    insertIndex = targetIndex + 1;
  } else {
    // up/top: insert BEFORE the target sibling
    if (targetIndex > fromIndex) targetIndex--;
    insertIndex = targetIndex;
  }

  nodes.splice(insertIndex, 0, removed);
  updateAllViews();
}

function insertAfterLastSibling(nodes, newNode) {
  let insertAt = -1;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.parentId === newNode.parentId && n.level === newNode.level) {
      insertAt = i;
    }
  }

  // If no siblings exist yet, try to insert after the parent itself
  if (insertAt === -1) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === newNode.parentId) {
        insertAt = i;
        break;
      }
    }
  }

  if (insertAt === -1) nodes.push(newNode);
  else nodes.splice(insertAt + 1, 0, newNode);
}

function setupCollapsibleSections() {
  var panel = document.getElementById("controlsPanel");
  if (!panel) return;

  // prevent double-binding if called more than once
  if (panel._collapsibleBound) return;
  panel._collapsibleBound = true;

  panel.addEventListener("click", function (e) {
    var el = e.target;

    // Walk up the DOM until we hit a collapsible header or the panel
    while (el && el !== panel) {
      if (el.classList && el.classList.contains("collapsible-header")) break;
      el = el.parentNode;
    }
    if (!el || el === panel) return;

    var targetId = el.getAttribute("data-target");
    if (!targetId) return;

    var section = document.getElementById(targetId);
    if (!section) return;

    var indicator = el.querySelector(".collapsible-indicator");
    var collapsed = section.classList.toggle("is-collapsed");
    if (indicator) indicator.textContent = collapsed ? "▸" : "▾";
  });
}

function applyDiagramAppearanceFromInputs() {
  var hInput = document.getElementById("boxHeightInput");
  var gInput = document.getElementById("boxGapInput");
  var fsInput = document.getElementById("boxFontSizeInput");
  var ffInput = document.getElementById("boxFontFamilyInput");
  var boldInput = document.getElementById("boxFontBoldInput");

  if (!hInput || !gInput || !fsInput || !ffInput) return;

  var h = parseInt(hInput.value, 10);
  var g = parseInt(gInput.value, 10);
  var fs = parseInt(fsInput.value, 10);
  var ff = ffInput.value.trim();
  var bold = !!(boldInput && boldInput.checked);

  if (!isFinite(h) || h <= 0) h = 32;
  if (!isFinite(g) || g < 0) g = 8;
  if (!isFinite(fs) || fs <= 0) fs = 13;

  diagramAppearance.boxHeight = h;
  diagramAppearance.verticalGap = g;
  diagramAppearance.fontSize = fs;
  diagramAppearance.fontFamily = ff;
  diagramAppearance.fontBold = bold; 

  updateAllViews();
}

function setAppearanceInputsFromConfig() {
  var hInput = document.getElementById("boxHeightInput");
  var gInput = document.getElementById("boxGapInput");
  var fsInput = document.getElementById("boxFontSizeInput");
  var ffInput = document.getElementById("boxFontFamilyInput");
  var boldInput = document.getElementById("boxFontBoldInput");

  if (!hInput || !gInput || !fsInput || !ffInput || !boldInput) return;

  hInput.value = diagramAppearance.boxHeight;
  gInput.value = diagramAppearance.verticalGap;
  fsInput.value = diagramAppearance.fontSize;
  ffInput.value = diagramAppearance.fontFamily || "";
  boldInput.checked = !!diagramAppearance.fontBold;
}


function updateAllViews() {
  refreshParentOptions();
  renderDiagram();
  refreshColorSelect();
  renderColorOptionsList();
  renderLegend();
  updateLegendVisibility();
  updateDiagramSelectionBar();

}

/* ---------- Actions from the form ---------- */

function addNodeFromForm() {
  var textEl = document.getElementById("nodeText");
  var levelEl = document.getElementById("nodeLevel");
  var parentEl = document.getElementById("nodeParent");
  var colorEl = document.getElementById("nodeColor");

  if (!textEl || !levelEl || !parentEl) return;

  var text = textEl.value.trim();
  var level = levelEl.value;
  var parentId = parentEl.value;
  var color = colorEl ? colorEl.value : "";

  if (!text) {
    alert("Please enter some text for this item.");
    return;
  }

    var node = createNode({
  level: level,
  text: text,
  parentId: parentId,
  color: color
});

// If there's a parent, insert after siblings; otherwise append.
if (parentId) {
  insertAfterLastSibling(nodes, node);
} else {
  nodes.push(node);
}

// If a parent was chosen, add a connection for it
if (parentId) {
  connections.push({ fromId: parentId, toId: node.id });
}
  textEl.value = "";
  updateAllViews();

}

/* ---------- Edit existing node ---------- */


/* B1.2: Selection and inline editing */

var selectedDiagramNodeId = null;
var activeDiagramTextEdit = null;


function selectDiagramNode(nodeId) {
  // Do not change selection while editing text.
  if (activeDiagramTextEdit) {
    var feedback = document.getElementById("diagramEditFeedback");
    if (feedback) {
      feedback.textContent = "Save or cancel the current edit first.";
    }
    return;
  }

  // Clicking the selected element again deselects it.
  selectedDiagramNodeId =
    selectedDiagramNodeId === nodeId ? null : nodeId;

  document.querySelectorAll(".diagram-node").forEach(
    function (box) {
      box.classList.toggle(
        "diagram-selected",
        box.getAttribute("data-id") === selectedDiagramNodeId
      );
    }
  );

  updateDiagramSelectionBar();
}


function updateDiagramSelectionBar() {
  var bar = document.getElementById("diagramSelectionBar");
  if (!bar) return;

  var node = nodes.find(function (n) {
    return n.id === selectedDiagramNodeId;
  });

  if (!node) {
    selectedDiagramNodeId = null;
    activeDiagramTextEdit = null;
    bar.hidden = true;
    return;
  }

  // Only show the selection bar during active editing.
// Save and Cancel remain available there.
bar.hidden = !activeDiagramTextEdit;

  document.getElementById(
    "diagramSelectedDescription"
  ).textContent = getLevelLabel(node.level) + ": " + node.text;

  var editing = !!activeDiagramTextEdit;

  document.getElementById("diagramEditTextBtn").hidden = true;
  document.getElementById("diagramSaveTextBtn").hidden = !editing;
  document.getElementById("diagramCancelTextBtn").hidden = !editing;

  document.getElementById("diagramEditFeedback").textContent =
    editing
      ? "Editing inside the box. Ctrl+Enter to save; Escape to cancel."
      : "";
}

function editNode(nodeId) {
  var node = nodes.find(function (n) {
    return n.id === nodeId;
  });

  if (!node || activeDiagramTextEdit) return;

  selectedDiagramNodeId = nodeId;

  activeDiagramTextEdit = {
    id: nodeId,
    draft: node.text
  };

  renderDiagram();
  updateDiagramSelectionBar();

  var input = document.getElementById("diagramInlineText");

  if (input) {
    input.focus();
    input.select();
  }
}

function saveDiagramInlineText() {
  if (!activeDiagramTextEdit) return;

  var id = activeDiagramTextEdit.id;
  var input = document.getElementById("diagramInlineText");

  var nextText = (
    input ? input.value : activeDiagramTextEdit.draft
  ).trim();

  if (!nextText) {
    document.getElementById("diagramEditFeedback").textContent =
      "Text cannot be empty.";
    if (input) input.focus();
    return;
  }

  var node = nodes.find(function (n) {
    return n.id === id;
  });

  if (node) node.text = nextText;

  activeDiagramTextEdit = null;

  // Recalculate the box height after editing.
  delete measuredBoxHeightsById[id];
  delete measuredItemHeightsById[id];

  updateAllViews();
}

function cancelDiagramInlineText() {
  if (!activeDiagramTextEdit) return;

  activeDiagramTextEdit = null;
  updateAllViews();
}

/* ---------- Actions from + buttons ---------- */

function addConnectionForNode(nodeId) {
  var refNode = nodes.find(function (n) {
    return n.id === nodeId;
  });
  if (!refNode) return;

  var prevLevel = getPreviousLevel(refNode.level);
  if (!prevLevel) {
    alert("This item is already at the highest level and cannot have a parent.");
    return;
  }

  // Candidates: nodes on the previous level
  var candidates = nodes.filter(function (n) {
    return n.level === prevLevel && n.id !== nodeId;
  });

  if (!candidates.length) {
    alert("No " + getLevelLabel(prevLevel) + " items available to connect to yet.");
    return;
  }

  var listText = candidates
    .map(function (n) {
      var shortText =
        n.text.length > 40 ? n.text.slice(0, 37) + "…" : n.text;
      return "[" + n.id + "] " + shortText;
    })
    .join("\n");

  var defaultId = refNode.parentId || candidates[0].id;
  var input = window.prompt(
    "Enter the ID of the " +
      getLevelLabel(prevLevel) +
      " you want to connect to this item:\n\n" +
      listText,
    defaultId
  );
  if (input === null) return;
  var parentId = input.trim();
  if (!parentId) {
    alert("No ID entered.");
    return;
  }

  var parent = candidates.find(function (n) {
    return n.id === parentId;
  });
  if (!parent) {
    alert("No item found with ID " + parentId + ".");
    return;
  }

  // Prevent duplicate link
  var exists = connections.some(function (c) {
    return c.fromId === parentId && c.toId === nodeId;
  });
  if (exists) {
    alert("That connection already exists.");
    return;
  }

  connections.push({ fromId: parentId, toId: nodeId });

  // If this item does not yet have a primary parent, use this one
  if (!refNode.parentId) {
    refNode.parentId = parentId;
  }

  updateAllViews();
}

function removeConnectionForNode(nodeId) {
  var refNode = nodes.find(function (n) {
    return n.id === nodeId;
  });
  if (!refNode) return;

  // All parents that currently have a line to this node
  var parentIds = connections
    .filter(function (c) {
      return c.toId === nodeId;
    })
    .map(function (c) {
      return c.fromId;
    });

  // Deduplicate
  parentIds = parentIds.filter(function (pid, idx, arr) {
    return arr.indexOf(pid) === idx;
  });

  if (!parentIds.length) {
    alert("This item has no incoming connections to remove.");
    return;
  }

  var listText = parentIds
    .map(function (pid) {
      var parent = nodes.find(function (n) {
        return n.id === pid;
      });
      var label = parent ? parent.text : "(missing item)";
      if (label.length > 40) {
        label = label.slice(0, 37) + "…";
      }
      return "[" + pid + "] " + label;
    })
    .join("\n");

  var input = window.prompt(
    "Enter the ID of the parent connection you want to remove:\n\n" +
      listText,
    parentIds[0]
  );
  if (input === null) return;
  var parentId = input.trim();
  if (!parentId || parentIds.indexOf(parentId) === -1) {
    alert("No connection found for ID " + parentId + ".");
    return;
  }

  // Remove that specific connection
  connections = connections.filter(function (c) {
    return !(c.fromId === parentId && c.toId === nodeId);
  });

  // If this was the 'main' parent, update parentId to another parent (if any)
  if (refNode.parentId === parentId) {
    var remainingParents = connections
      .filter(function (c) {
        return c.toId === nodeId;
      })
      .map(function (c) {
        return c.fromId;
      });

    refNode.parentId = remainingParents.length ? remainingParents[0] : "";
  }

  updateAllViews();
}


function handleConnectionButtonClick(nodeId) {
  var refNode = nodes.find(function (n) { return n.id === nodeId; });
  if (!refNode) return;

  var previousLevel = getPreviousLevel(refNode.level);
  if (!previousLevel) return;

  var candidates = nodes.filter(function (n) {
    return n.level === previousLevel && n.id !== nodeId;
  });
  if (!candidates.length) {
    alert("There are no " + getLevelLabel(previousLevel) + " items to connect to.");
    return;
  }

  // Protect unusual older diagrams rather than silently deleting their links.
  var candidateIds = candidates.map(function (n) { return n.id; });
  var unusualLink = connections.some(function (c) {
    return c.toId === nodeId && candidateIds.indexOf(c.fromId) === -1;
  });
  if (unusualLink || (refNode.parentId && candidateIds.indexOf(refNode.parentId) === -1)) {
    alert("This item has a connection outside the expected driver levels. " +
      "No changes have been made. Please keep this saved diagram for review.");
    return;
  }

  if (document.getElementById("connectionEditorDialog")) return;

  var connectedIds = connections.filter(function (c) {
    return c.toId === nodeId;
  }).map(function (c) { return c.fromId; });

  var dialog = document.createElement("dialog");
  dialog.id = "connectionEditorDialog";
  dialog.setAttribute("aria-labelledby", "connectionEditorTitle");
  dialog.style.cssText = "box-sizing:border-box;width:min(520px,calc(100vw - 24px));" +
    "max-height:85vh;overflow-y:auto;border:1px solid #cbd5e1;border-radius:12px;" +
    "padding:20px;background:#fff;color:#111;box-shadow:0 16px 44px rgba(0,0,0,.22);" +
    "font-family:inherit;font-size:14px;";

  function addText(tag, text, css, parent) {
    var element = document.createElement(tag);
    element.textContent = text;
    if (css) element.style.cssText = css;
    (parent || dialog).appendChild(element);
    return element;
  }

  var title = addText("h2", "Manage connections", "margin:0 0 8px;font-size:20px;");
  title.id = "connectionEditorTitle";
  addText("p", refNode.text, "margin:0 0 12px;font-weight:600;overflow-wrap:anywhere;");
  addText("p", "Select the " + getLevelLabel(previousLevel) +
    " items that should connect to this element.",
    "margin:0 0 14px;color:#475569;");

  var list = document.createElement("div");
  list.style.cssText = "display:grid;gap:8px;margin-bottom:14px;";
  dialog.appendChild(list);
  var checkboxes = [];

  candidates.forEach(function (candidate) {
    var label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:flex-start;gap:10px;" +
      "padding:10px;border:1px solid #d1d5db;border-radius:8px;" +
      "cursor:pointer;margin:0;min-height:44px;box-sizing:border-box;";

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = candidate.id;
    checkbox.checked = connectedIds.indexOf(candidate.id) !== -1 ||
      refNode.parentId === candidate.id;
    checkbox.style.cssText = "width:18px;height:18px;margin:2px 0 0;" +
      "flex-shrink:0;accent-color:#005eb8;";
    label.appendChild(checkbox);

    var details = document.createElement("span");
    details.style.cssText = "display:block;min-width:0;overflow-wrap:anywhere;";
    addText("span", candidate.text, "display:block;font-weight:600;", details);
    if (refNode.parentId === candidate.id) {
      addText("small", "Current main parent (sets layout position)",
        "display:block;color:#005eb8;margin-top:3px;", details);
    }
    var ancestor = nodes.find(function (n) { return n.id === candidate.parentId; });
    if (ancestor && candidates.length > 1) {
      addText("small", "Under: " + ancestor.text,
        "display:block;color:#64748b;margin-top:3px;", details);
    }
    label.appendChild(details);
    list.appendChild(label);
    checkboxes.push(checkbox);
  });

  addText("p", "If the main parent is unticked, another selected parent " +
    "will become the main parent. Leaving all boxes unticked removes " +
    "all incoming connections but keeps the element.",
    "margin:0 0 16px;font-size:12px;color:#475569;");

  var actions = document.createElement("div");
  actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;";
  dialog.appendChild(actions);

  var cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.style.cssText = "background:#e8edf5;color:#005eb8;";
  actions.appendChild(cancel);

  var save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save connections";
  actions.appendChild(save);

  dialog.addEventListener("close", function () {
    dialog.remove();
    // Rendering recreates diagram buttons: restore focus to the new one.
    var boxes = document.querySelectorAll(".diagram-node");
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].getAttribute("data-id") === nodeId) {
        var button = boxes[i].querySelector(".diagram-add-left");
        if (button) button.focus();
        break;
      }
    }
  });

  cancel.addEventListener("click", function () { dialog.close(); });
  save.addEventListener("click", function () {
    var selectedIds = checkboxes.filter(function (input) {
      return input.checked;
    }).map(function (input) { return input.value; });

    // Leave other nodes and their connections completely untouched.
    connections = connections.filter(function (c) { return c.toId !== nodeId; });
    selectedIds.forEach(function (parentId) {
      connections.push({ fromId: parentId, toId: nodeId });
    });

    // Keep the original main parent when still selected.
    if (selectedIds.indexOf(refNode.parentId) === -1) {
      refNode.parentId = selectedIds.length ? selectedIds[0] : "";
    }

    dialog.close();
    updateAllViews();
  });

  document.body.appendChild(dialog);
  dialog.showModal();
  if (checkboxes.length) checkboxes[0].focus();
}



function addChildForNode(nodeId) {
  var refNode = nodes.find(function (n) {
    return n.id === nodeId;
  });
  if (!refNode) return;

  var nextLevel = getNextLevel(refNode.level);
  if (!nextLevel) {
    // No further level; keep same level for extra children
    nextLevel = refNode.level;
  }

  var defaultPrompt =
    "Enter text for new " + getLevelLabel(nextLevel) + " (child)";
  var text = window.prompt(defaultPrompt, "");
  if (!text) return;

  var newNode = createNode({
    level: nextLevel,
    text: text.trim(),
    parentId: refNode.id,
    color: refNode.color // inherit colour
  });

    insertAfterLastSibling(nodes, newNode);

  // Record the connection parent -> child
  connections.push({ fromId: refNode.id, toId: newNode.id });

  updateAllViews();

}

function ensureDefaultAim() {
  var hasAim = nodes.some(function (n) {
    return n.level === "aim";
  });
  if (hasAim) return;

  var aimNode = createNode({
    level: "aim",
    text: "Aim",     // you can change to "Click to edit…" if you prefer
    parentId: "",
    color: ""
  });

  nodes.push(aimNode);
  updateNextIdFromNodes();
}



/* ---------- Clear / delete ---------- */

function clearAllNodes() {
  if (!window.confirm("Clear all items from this driver diagram?")) return;

  nodes = [];
  connections = [];

  // Clear palette too
  colorOptions = [];
  editingColorValue = null;

  // Clear colour form inputs
  var labelInput = document.getElementById("colorLabelInput");
  var valueInput = document.getElementById("colorValueInput");
  if (labelInput) labelInput.value = "";
  if (valueInput) valueInput.value = "#fff7cc";

  updateNextIdFromNodes();
  ensureDefaultAim();
  updateAllViews();
}


function deleteNode(id) {
  var toDelete = new Set([id]);
  var changed = true;

  while (changed) {
    changed = false;
    nodes.forEach(function (n) {
      if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
        toDelete.add(n.id);
        changed = true;
      }
    });
  }

  if (
    !window.confirm(
      "Delete this item and " + (toDelete.size - 1) + " dependent item(s)?"
    )
  ) {
    return;
  }

    nodes = nodes.filter(function (n) {
    return !toDelete.has(n.id);
  });

  // Remove any connections touching deleted nodes
  connections = connections.filter(function (c) {
    return !toDelete.has(c.fromId) && !toDelete.has(c.toId);
  });

  updateNextIdFromNodes();
  ensureDefaultAim();
  updateAllViews();

}

/* ---------- Portable HTML project ---------- */

/*
  Creates a clean data object containing everything needed to
  reconstruct the diagram.
*/
function getPortableProjectData() {
  return {
    format: "driver-diagram-portable",
    version: 1,
    savedAt: new Date().toISOString(),

    nodes: nodes.map(function (n) {
      return {
        id: (n.id || "").toString(),
        level: n.level || "",
        text: n.text || "",
        parentId: n.parentId || "",
        color: n.color || "",
        autoSize: !!n.autoSize,
        measures: Array.isArray(n.measures)
          ? n.measures.map(function (m) {
              return {
                type: (m && m.type) ? m.type : "none",
                text: (m && m.text) ? m.text : ""
              };
            })
          : []
      };
    }),

    connections: connections.map(function (c) {
      return {
        fromId: (c.fromId || "").toString(),
        toId: (c.toId || "").toString()
      };
    }),

    colorOptions: colorOptions.map(function (c) {
      return {
        label: c.label || "",
        value: c.value || ""
      };
    }),

    columnTitles: {
      aim: columnTitles.aim || "Aim",
      primary: columnTitles.primary || "Primary drivers",
      secondary: columnTitles.secondary || "Secondary drivers",
      change: columnTitles.change || "Change ideas"
    },

    diagramAppearance: {
      boxHeight: diagramAppearance.boxHeight,
      verticalGap: diagramAppearance.verticalGap,
      fontSize: diagramAppearance.fontSize,
      fontFamily: diagramAppearance.fontFamily || "",
      fontBold: !!diagramAppearance.fontBold
    },

    legendVisible: legendVisible !== false
  };
}


/*
  Makes JSON safe to place inside an HTML <script> element.

  This is important because users may type characters such as
  <, > or & into a node or measure.
*/
function makeJsonSafeForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}


/*
  Checks whether the currently opened HTML file contains an
  embedded portable project.

  Returns true if a project was successfully loaded.
*/
function loadEmbeddedProjectIfPresent() {
  var dataElement = document.getElementById("embeddedProjectData");

  if (!dataElement) {
    return false;
  }

  try {
    var raw = dataElement.textContent || "";
    var project = JSON.parse(raw);

    if (
      !project ||
      project.format !== "driver-diagram-portable" ||
      !Array.isArray(project.nodes)
    ) {
      throw new Error("This is not a recognised portable driver diagram.");
    }

    nodes = project.nodes.map(function (n) {
      return {
        id: (n.id || "").toString(),
        level: n.level || "",
        text: n.text || "",
        parentId: n.parentId || "",
        color: n.color || "",
        autoSize: !!n.autoSize,
        measures: Array.isArray(n.measures)
          ? n.measures.map(function (m) {
              return {
                type: (m && m.type) ? m.type : "none",
                text: (m && m.text) ? m.text : ""
              };
            })
          : []
      };
    });

    connections = Array.isArray(project.connections)
      ? project.connections
          .map(function (c) {
            return {
              fromId: (c.fromId || "").toString(),
              toId: (c.toId || "").toString()
            };
          })
          .filter(function (c) {
            return c.fromId && c.toId;
          })
      : [];

    colorOptions = Array.isArray(project.colorOptions)
      ? project.colorOptions
          .map(function (c) {
            return {
              label: (c.label || "").toString(),
              value: (c.value || "").toString()
            };
          })
          .filter(function (c) {
            return c.label && c.value;
          })
      : [];

    if (project.columnTitles) {
      if (project.columnTitles.aim) {
        columnTitles.aim = project.columnTitles.aim;
      }

      if (project.columnTitles.primary) {
        columnTitles.primary = project.columnTitles.primary;
      }

      if (project.columnTitles.secondary) {
        columnTitles.secondary = project.columnTitles.secondary;
      }

      if (project.columnTitles.change) {
        columnTitles.change = project.columnTitles.change;
      }
    }

    if (project.diagramAppearance) {
      var savedAppearance = project.diagramAppearance;

      if (
        isFinite(savedAppearance.boxHeight) &&
        savedAppearance.boxHeight > 0
      ) {
        diagramAppearance.boxHeight = savedAppearance.boxHeight;
      }

      if (
        isFinite(savedAppearance.verticalGap) &&
        savedAppearance.verticalGap >= 0
      ) {
        diagramAppearance.verticalGap = savedAppearance.verticalGap;
      }

      if (
        isFinite(savedAppearance.fontSize) &&
        savedAppearance.fontSize > 0
      ) {
        diagramAppearance.fontSize = savedAppearance.fontSize;
      }

      diagramAppearance.fontFamily =
        savedAppearance.fontFamily || "";

      diagramAppearance.fontBold =
        !!savedAppearance.fontBold;
    }

    legendVisible = project.legendVisible !== false;

    /*
      Clear old measurements so the newly opened project is
      measured from its actual rendered content.
    */
    measuredBoxHeightsById = {};
    measuredItemHeightsById = {};
    suppressAutosizeRelayout = false;

    updateNextIdFromNodes();

    /*
      Older portable files may not contain the connections array.
      In that case, reconstruct it from parentId.
    */
    if (!connections.length) {
      rebuildConnectionsFromParents();
    }

    return true;
  } catch (error) {
    console.error("Portable project load error:", error);

    alert(
      "The portable driver diagram could not be loaded.\n\n" +
      "The file may be damaged or may have been created by an incompatible version."
    );

    return false;
  }
}


/*
  Gets the application JavaScript.

  In a normal copy of the tool, it reads driver.js.
  In an already-portable copy, it reuses the embedded JavaScript.
*/
function getDriverSourceForPortableExport() {
  var embeddedSource =
    document.getElementById("portableDriverSource");

  if (
    embeddedSource &&
    (embeddedSource.textContent || "").trim()
  ) {
    return Promise.resolve(embeddedSource.textContent);
  }

  var driverScript = null;
  var scripts = document.querySelectorAll("script[src]");

  scripts.forEach(function (script) {
    var source = script.getAttribute("src") || "";

    if (/(^|\/)driver\.js(\?|#|$)/i.test(source)) {
      driverScript = script;
    }
  });

  var driverUrl;

  if (driverScript && driverScript.src) {
    driverUrl = driverScript.src;
  } else {
    driverUrl = new URL("driver.js", window.location.href).href;
  }

  return fetch(driverUrl, {
    cache: "no-store"
  }).then(function (response) {
    if (!response.ok) {
      throw new Error(
        "Could not read driver.js. HTTP status: " +
        response.status
      );
    }

    return response.text();
  });
}


/*
  Creates a suitable filename from the Aim text.
*/
function getPortableFilename() {
  var aimNode = nodes.find(function (n) {
    return n.level === "aim";
  });

  var filename =
    aimNode && aimNode.text
      ? aimNode.text
      : "driver-diagram";

  filename = filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);

  if (!filename) {
    filename = "driver-diagram";
  }

  return filename + ".html";
}


/*
  Creates and downloads the portable HTML file.
*/
function downloadPortableHtml() {
  if (!nodes.length) {
    alert("There is no driver diagram to save.");
    return;
  }

  var projectData = getPortableProjectData();
  var projectJson = makeJsonSafeForHtml(projectData);

  getDriverSourceForPortableExport()
    .then(function (driverSource) {
      /*
        Clone the current page.

        Event listeners are not included in the clone, so they
        will be recreated normally when the saved file opens.
      */
      var htmlClone =
        document.documentElement.cloneNode(true);

      /*
        Remove temporary menus created while using the tool.
      */
      htmlClone
        .querySelectorAll(
          "#nodeContextMenu, .node-context-submenu"
        )
        .forEach(function (element) {
          element.remove();
        });

      /*
        Ensure the Help window is closed in the saved copy.
      */
      var helpOverlay =
        htmlClone.querySelector("#helpOverlay");

      if (helpOverlay) {
        helpOverlay.classList.remove("is-open");
        helpOverlay.setAttribute("aria-hidden", "true");
      }

      /*
        Remove the normal external driver.js reference and any
        older embedded project/application scripts.
      */
      htmlClone
        .querySelectorAll("script")
        .forEach(function (script) {
          var source =
            script.getAttribute("src") || "";

          var isDriverScript =
            /(^|\/)driver\.js(\?|#|$)/i.test(source);

          var isOldPortableData =
            script.id === "embeddedProjectData";

          var isOldPortableSource =
            script.id === "portableDriverSource";

          if (
            isDriverScript ||
            isOldPortableData ||
            isOldPortableSource
          ) {
            script.remove();
          }
        });

      var cloneBody =
        htmlClone.querySelector("body");

      if (!cloneBody) {
        throw new Error(
          "Could not find the document body."
        );
      }

      /*
        Add the project data before the application code.
      */
      var dataScript =
        document.createElement("script");

      dataScript.id = "embeddedProjectData";
      dataScript.type = "application/json";
      dataScript.textContent = projectJson;

      cloneBody.appendChild(dataScript);

      /*
        Inline driver.js so the portable copy does not need the
        separate driver.js file.
      */
      var applicationScript =
        document.createElement("script");

      applicationScript.id = "portableDriverSource";

      /*
        Prevent any literal closing-script sequence inside the
        JavaScript from prematurely ending this script element.
      */
      applicationScript.textContent =
        driverSource.replace(
          /<\/script/gi,
          "<\\/script"
        );

      cloneBody.appendChild(applicationScript);

      var completeHtml =
        "<!DOCTYPE html>\n" +
        htmlClone.outerHTML;

      var blob = new Blob(
        [completeHtml],
        {
          type: "text/html;charset=utf-8"
        }
      );

      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");

      link.href = url;
      link.download = getPortableFilename();

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    })
    .catch(function (error) {
      console.error(
        "Portable HTML export error:",
        error
      );

      alert(
        "The portable HTML file could not be created.\n\n" +
        "The tool could not read driver.js. This can happen when the original tool is opened directly from a folder rather than through a web address or local web server.\n\n" +
        "Technical detail: " +
        error.message
      );
    });
}


/* ---------- CSV import / export ---------- */

function downloadCsv() {
  if (nodes.length === 0) {
    alert("No items to export yet.");
    return;
  }

    var dataForCsv = nodes.map(function (n) {
    // all parents for this node according to connections
    var parentLinks = connections
      .filter(function (c) { return c.toId === n.id; })
      .map(function (c) { return c.fromId; });

    // main parent stays in parent_id column
    var mainParentId = n.parentId || "";

    // extra parents are any other connected parents
    var extraParents = parentLinks.filter(function (pid) {
      return pid && pid !== mainParentId;
    });

    return {
      id: n.id,
      level: n.level,
      parent_id: mainParentId,
      text: n.text,
      color: n.color || "",
      auto_size: n.autoSize ? "1" : "0",
      extra_parents: extraParents.join(";"),
      box_height: diagramAppearance.boxHeight,
      vertical_gap: diagramAppearance.verticalGap,
      font_size: diagramAppearance.fontSize,
      font_family: diagramAppearance.fontFamily || "",
      font_bold: diagramAppearance.fontBold ? "1" : "0",
	title_aim: columnTitles.aim,
	title_primary: columnTitles.primary,
	title_secondary: columnTitles.secondary,
	title_change: columnTitles.change,
	palette_json: JSON.stringify(colorOptions || []),
        measures_json: JSON.stringify(n.measures || [])

    };
  });


  var csv = Papa.unparse(dataForCsv);
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  var url = URL.createObjectURL(blob);

  var link = document.createElement("a");
  link.href = url;
  link.download = "driver-diagram.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function uploadCsv(file) {
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      if (results.errors && results.errors.length > 0) {
        console.error("CSV parse errors", results.errors);
      }

      var rows = results.data || [];
      var imported = [];
      var extraConnectionsRaw = []; // { childId, parents[] }
      var appearanceFromCsv = null;
      var titlesFromCsv = null;
      var paletteFromCsv = null;

      rows.forEach(function (row, index) {
        var id = (row.id || "").toString().trim();
        var level = (row.level || "").toString().trim();
        var text = (row.text || "").toString().trim();
        var parentId = (row.parent_id || "").toString().trim();
        var color = (row.color || "").toString().trim();

        // ---- Measures (NEW) ----
        var measures = [];
        var mj = (row.measures_json || "").toString().trim();
        if (mj) {
          try {
            var parsedM = JSON.parse(mj);
            if (Array.isArray(parsedM)) measures = parsedM;
          } catch (e) {
            console.warn("Could not parse measures_json on row " + (index + 1) + ":", e);
          }
        }

        // new column (may be missing in older CSVs)
        var extraParentsField = (row.extra_parents || "").toString().trim();

        if (!id || !level || !text) {
          console.warn("Skipping row " + (index + 1) + " - missing id/level/text.");
          return;
        }

        imported.push({
          id: id,
          level: level,
          text: text,
          parentId: parentId,
          color: color,
          autoSize: ((row.auto_size || "").toString().trim() === "1"),
          measures: measures
        });

        // Parse extra parents into an array of IDs
        if (extraParentsField) {
          var parents = extraParentsField
            .split(/[;,]/)
            .map(function (s) { return s.trim(); })
            .filter(Boolean);

          if (parents.length) {
            extraConnectionsRaw.push({ childId: id, parents: parents });
          }
        }

        // Palette (read once)
        if (!paletteFromCsv) {
          var rawPalette = (row.palette_json || "").toString().trim();
          if (rawPalette) {
            try {
              var parsed = JSON.parse(rawPalette);
              if (Array.isArray(parsed)) paletteFromCsv = parsed;
            } catch (e) {
              console.warn("Could not parse palette_json:", e);
            }
          }
        }

        // Titles (read once)
        if (!titlesFromCsv) {
          var ta = (row.title_aim || "").toString().trim();
          var tp = (row.title_primary || "").toString().trim();
          var ts = (row.title_secondary || "").toString().trim();
          var tc = (row.title_change || "").toString().trim();

          var hasAnyTitle = ta || tp || ts || tc;
          if (hasAnyTitle) {
            titlesFromCsv = { aim: ta, primary: tp, secondary: ts, change: tc };
          }
        }

        // Appearance settings (read once)
        if (!appearanceFromCsv) {
          var bh = parseInt(row.box_height, 10);
          var vg = parseInt(row.vertical_gap, 10);
          var fs = parseInt(row.font_size, 10);
          var ff = (row.font_family || "").toString();
          var fbRaw = (row.font_bold || "").toString().trim().toLowerCase();
          var fb = fbRaw === "1" || fbRaw === "true" || fbRaw === "yes";

          var hasAny =
            (row.box_height && !isNaN(bh)) ||
            (row.vertical_gap && !isNaN(vg)) ||
            (row.font_size && !isNaN(fs)) ||
            ff ||
            fbRaw;

          if (hasAny) {
            appearanceFromCsv = {
              boxHeight: isFinite(bh) && bh > 0 ? bh : diagramAppearance.boxHeight,
              verticalGap: isFinite(vg) && vg >= 0 ? vg : diagramAppearance.verticalGap,
              fontSize: isFinite(fs) && fs > 0 ? fs : diagramAppearance.fontSize,
              fontFamily: ff,
              fontBold: fb
            };
          }
        }
      });

      nodes = imported;
      updateNextIdFromNodes();

      // Palette restore
      if (paletteFromCsv && paletteFromCsv.length) {
        colorOptions = paletteFromCsv
          .map(function (o) {
            return {
              label: (o.label || "").toString().trim(),
              value: (o.value || "").toString().trim()
            };
          })
          .filter(function (o) { return o.label && o.value; });
      } else {
        rebuildColorOptionsFromNodes();
      }

      // Baseline connections from parentId
      rebuildConnectionsFromParents();

      // Extra connections from extra_parents
      extraConnectionsRaw.forEach(function (entry) {
        var childId = entry.childId;
        entry.parents.forEach(function (pid) {
          var parentExists = nodes.some(function (n) { return n.id === pid; });
          var childExists = nodes.some(function (n) { return n.id === childId; });
          if (!parentExists || !childExists) return;

          var already = connections.some(function (c) {
            return c.fromId === pid && c.toId === childId;
          });
          if (!already) {
            connections.push({ fromId: pid, toId: childId });
          }
        });
      });

      // Apply appearance
      if (appearanceFromCsv) {
        diagramAppearance.boxHeight = appearanceFromCsv.boxHeight;
        diagramAppearance.verticalGap = appearanceFromCsv.verticalGap;
        diagramAppearance.fontSize = appearanceFromCsv.fontSize;
        diagramAppearance.fontFamily = appearanceFromCsv.fontFamily;
        diagramAppearance.fontBold = appearanceFromCsv.fontBold;
        setAppearanceInputsFromConfig();
      }

      // Apply titles
      if (titlesFromCsv) {
        if (titlesFromCsv.aim) columnTitles.aim = titlesFromCsv.aim;
        if (titlesFromCsv.primary) columnTitles.primary = titlesFromCsv.primary;
        if (titlesFromCsv.secondary) columnTitles.secondary = titlesFromCsv.secondary;
        if (titlesFromCsv.change) columnTitles.change = titlesFromCsv.change;
      }

      renderColorOptionsList();
      renderLegend();

      updateAllViews();
      alert("Loaded " + nodes.length + " items from CSV.");
    }
  });
}

/* ---------- View toggles & export ---------- */

function toggleControlsVisibility() {
  var panel = document.getElementById("controlsPanel");
  var btn = document.getElementById("btnToggleControls");
  var layout = document.querySelector("main"); // the 2-column grid
  if (!panel || !btn || !layout) return;

  controlsVisible = !controlsVisible;
  panel.style.display = controlsVisible ? "" : "none";
  btn.textContent = controlsVisible ? "Hide editing panel" : "Show editing panel";

  // When controls are hidden, make the diagram take full width;
  // when shown, revert to the original 2-column layout.
  if (controlsVisible) {
    layout.style.gridTemplateColumns = ""; // fall back to CSS (two columns)
  } else {
    layout.style.gridTemplateColumns = "minmax(0, 1fr)"; // single column
  }

  // Recalculate node positions and redraw connection lines after layout change
  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(updateAllViews);
  } else {
    updateAllViews();
  }
}


// Helper: temporarily replace the live SVG with an <img> snapshot
// so html2canvas / html2pdf capture lines reliably.

function withSvgImageOverlay(runCapture) {
  var exportArea = document.getElementById("exportArea");
  var svg = document.getElementById("diagramConnections");
  var canvasDiv = document.getElementById("diagramCanvas");
  if (!exportArea || !svg || !canvasDiv) {
    // Fallback: run capture directly
    return runCapture();
  }

  // Make sure positions + connections are up to date
  updateAllViews();

  var serializer;
  try {
    serializer = new XMLSerializer();
  } catch (e) {
    console.error("XMLSerializer not available, capturing directly.", e);
    return runCapture();
  }

  var svgClone = svg.cloneNode(true);
  var svgString = serializer.serializeToString(svgClone);
  var dataUrl =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(svgString);

  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      // Hide original SVG and overlay the image in the same spot
      svg.style.visibility = "hidden";
      img.style.position = "absolute";
      img.style.top = "0";
      img.style.left = "0";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.pointerEvents = "none";

      canvasDiv.appendChild(img);

      var p;
      try {
        p = runCapture();
      } catch (err) {
        cleanup();
        reject(err);
        return;
      }

      function cleanup() {
        try {
          canvasDiv.removeChild(img);
        } catch (e) {}
        svg.style.visibility = "";
      }

      if (p && typeof p.then === "function") {
        p.then(function (result) {
          cleanup();
          resolve(result);
        }).catch(function (err) {
          cleanup();
          reject(err);
        });
      } else {
        cleanup();
        resolve(p);
      }
    };

    img.onerror = function (err) {
      console.error("SVG image overlay failed, capturing directly.", err);
      // Fallback: run capture without overlay
      try {
        var p2 = runCapture();
        if (p2 && typeof p2.then === "function") {
          p2.then(resolve).catch(reject);
        } else {
          resolve(p2);
        }
      } catch (e2) {
        reject(e2);
      }
    };

    img.src = dataUrl;
  });
}



function exportDiagramPng() {
  var exportArea = document.getElementById("exportArea");
  if (!exportArea) {
    alert("Could not find diagram to export.");
    return;
  }

  // Hide badges + add/connect buttons for export
  exportArea.classList.add("export-clean");

  withSvgImageOverlay(function () {
    // Return the html2canvas promise so the helper can clean up afterwards
    return html2canvas(exportArea, {
      scale: 2,
      useCORS: true,
      logging: false
    });
  })
    .then(function (canvas) {
      exportArea.classList.remove("export-clean");
      if (!canvas) return;

      canvas.toBlob(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "driver-diagram.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
    })
    .catch(function (err) {
      console.error("PNG export error:", err);
      exportArea.classList.remove("export-clean");
    });
}



function exportDiagramPdf() {
  var exportArea = document.getElementById("exportArea");
  if (!exportArea) {
    alert("Could not find diagram to export.");
    return;
  }

  var opt = {
    margin: 10,
    filename: "driver-diagram.pdf",
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: "mm", format: "a4", orientation: "landscape" }
  };

  exportArea.classList.add("export-clean");

  withSvgImageOverlay(function () {
    // html2pdf returns a Promise
    return html2pdf().set(opt).from(exportArea).save();
  })
    .then(function () {
      exportArea.classList.remove("export-clean");
    })
    .catch(function (err) {
      console.error("PDF export error:", err);
      exportArea.classList.remove("export-clean");
    });
}



function updateLegendVisibility() {
    var legend = document.getElementById("legendContainer");
    var btn = document.getElementById("toggleLegendBtn");

    if (legendVisible) {
        legend.style.display = "block";
        btn.textContent = "Hide key";
    } else {
        legend.style.display = "none";
        btn.textContent = "Show key";
    }
}

/* ---------- Help / info modal ---------- */

function openHelpOverlay() {
  var overlay = document.getElementById("helpOverlay");
  if (!overlay) return;
  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
}

function closeHelpOverlay() {
  var overlay = document.getElementById("helpOverlay");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
}

function ensureNodeContextMenu() {
  if (nodeContextMenuEl) return;

  var menu = document.createElement("div");
  menu.id = "nodeContextMenu";
  menu.style.display = "none";
  menu.style.position = "fixed";
  menu.style.zIndex = "9999";
  menu.style.minWidth = "190px";
  menu.style.background = "#fff";
  menu.style.border = "1px solid #d0d7de";
  menu.style.borderRadius = "8px";
  menu.style.boxShadow = "0 8px 24px rgba(0,0,0,0.14)";
  menu.style.padding = "6px";
  menu.style.fontSize = "13px";
  menu.style.color = "#111";     // <-- force readable text

  function addItem(label, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.display = "block";
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.style.padding = "8px 10px";
    btn.style.border = "0";
    btn.style.background = "transparent";
    btn.style.color = "#111";      // <-- force readable text on the buttons
    btn.style.cursor = "pointer";
    btn.style.borderRadius = "6px";
    btn.addEventListener("mouseenter", function () { btn.style.background = "#f6f8fa"; });
    btn.addEventListener("mouseleave", function () { btn.style.background = "transparent"; });
    btn.addEventListener("click", function (e) {
  e.preventDefault();
  e.stopPropagation();

  // capture the id before closing the menu (close clears contextNodeId)
  var id = contextNodeId;

  // run the action first, then close
  onClick(id);
  closeNodeContextMenu();
});
    menu.appendChild(btn);
  }

  function addDivider() {
    var hr = document.createElement("div");
    hr.style.height = "1px";
    hr.style.background = "#eaeef2";
    hr.style.margin = "6px 0";
    menu.appendChild(hr);
  }

function addSimpleSubmenu(label, buildItemsFn) {
  // Row inside the main context menu
  var row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.padding = "8px 10px";
  row.style.borderRadius = "6px";
  row.style.cursor = "pointer";
  row.style.color = "#111";

  var left = document.createElement("span");
  left.textContent = label;
  var right = document.createElement("span");
  right.textContent = "▸";
  right.style.opacity = "0.7";

  row.appendChild(left);
  row.appendChild(right);

  row.addEventListener("mouseenter", function () { row.style.background = "#f6f8fa"; });
  row.addEventListener("mouseleave", function () { row.style.background = "transparent"; });

  // Submenu container
  var sub = document.createElement("div");
  sub.className = "node-context-submenu";
  sub.style.position = "fixed";
  sub.style.display = "none";
  sub.style.zIndex = "10000";
  sub.style.minWidth = "240px";
  sub.style.background = "#fff";
  sub.style.border = "1px solid #d0d7de";
  sub.style.borderRadius = "8px";
  sub.style.boxShadow = "0 8px 24px rgba(0,0,0,0.14)";
  sub.style.padding = "6px";
  sub.style.fontSize = "13px";
  sub.style.color = "#111";

  // Ensure closeNodeContextMenu hides this too
  // (If you already use nodeContextSubmenuEl for colour, we’ll hide ALL by class below)
  sub.className = "node-context-submenu";

  function addSubItem(text, onClick, disabled) {
    if (disabled) {
      var div = document.createElement("div");
      div.textContent = text;
      div.style.padding = "8px 10px";
      div.style.color = "#6b7280";
      div.style.userSelect = "none";
      sub.appendChild(div);
      return;
    }

    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.style.display = "block";
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.style.padding = "8px 10px";
    btn.style.border = "0";
    btn.style.background = "transparent";
    btn.style.cursor = "pointer";
    btn.style.borderRadius = "6px";
    btn.style.color = "#111";
    btn.addEventListener("mouseenter", function () { btn.style.background = "#f6f8fa"; });
    btn.addEventListener("mouseleave", function () { btn.style.background = "transparent"; });
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    sub.appendChild(btn);
  }

  function buildSubmenu() {
    sub.innerHTML = "";
    buildItemsFn(addSubItem);
  }

  function positionSubmenu() {
    var r = row.getBoundingClientRect();
    sub.style.display = "block";
    var sr = sub.getBoundingClientRect();

    var x = r.right + 6;
    var y = r.top;

    var maxX = window.innerWidth - sr.width - 8;
    var maxY = window.innerHeight - sr.height - 8;

    if (x > maxX) x = r.left - sr.width - 6;
    if (y > maxY) y = maxY;

    sub.style.left = x + "px";
    sub.style.top = y + "px";
  }

  var hideTimer = null;
  function show() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    buildSubmenu();
    positionSubmenu();
  }
  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      sub.style.display = "none";
    }, 180);
  }

  row.addEventListener("mouseenter", show);
  row.addEventListener("mouseleave", scheduleHide);
  sub.addEventListener("mouseenter", function () {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });
  sub.addEventListener("mouseleave", scheduleHide);

  sub.addEventListener("click", function (e) { e.stopPropagation(); });

  menu.appendChild(row);
  document.body.appendChild(sub);
}


  // Build menu items
  addItem("Edit text…", function (id) {
  if (!id) return;
  editNode(id);
});

addItem("Toggle auto-size to text", function (id) {
  if (!id) return;
  var n = nodes.find(function (x) { return x.id === id; });
  if (!n) return;
  n.autoSize = !n.autoSize;
  updateAllViews();
});

// ---------- Measures submenu ----------
addSimpleSubmenu("Measures", function (addSubItem) {
  var id = contextNodeId;
  var n = nodes.find(function (x) { return x.id === id; });

  addSubItem("Add measure…", function () {
    addMeasureToNode(id);
    closeNodeContextMenu();
  });

  var hasMeasures = !!(n && n.measures && n.measures.length);

  addSubItem("Edit measure…", function () {
    var list = n.measures.map(function (m, i) {
      return (i + 1) + ") " + (m.text || "");
    }).join("\n");

    var pick = window.prompt("Enter the measure number to edit:\n\n" + list, "1");
    if (pick === null) return;

    var idx = parseInt(pick, 10) - 1;
    if (!isFinite(idx) || idx < 0 || idx >= n.measures.length) {
      alert("That number is not valid.");
      return;
    }

    editMeasureOnNode(id, idx);
    closeNodeContextMenu();
  }, !hasMeasures);

  addSubItem("Delete measure…", function () {
    var list = n.measures.map(function (m, i) {
      return (i + 1) + ") " + (m.text || "");
    }).join("\n");

    var pick = window.prompt("Enter the measure number to delete:\n\n" + list, "1");
    if (pick === null) return;

    var idx = parseInt(pick, 10) - 1;
    if (!isFinite(idx) || idx < 0 || idx >= n.measures.length) {
      alert("That number is not valid.");
      return;
    }

    deleteMeasureOnNode(id, idx);
    closeNodeContextMenu();
  }, !hasMeasures);

  addSubItem("Clear all measures…", function () {
    clearMeasuresFromNode(id);
    closeNodeContextMenu();
  }, !hasMeasures);
});

addDivider();

// ---------- Organise submenu ----------
addSimpleSubmenu("Organise", function (addSubItem) {
  var id = contextNodeId;

  addSubItem("Move up", function () {
    moveNodeWithinSiblings(id, "up");
    closeNodeContextMenu();
  });

  addSubItem("Move down", function () {
    moveNodeWithinSiblings(id, "down");
    closeNodeContextMenu();
  });

  addSubItem("Move to top", function () {
    moveNodeWithinSiblings(id, "top");
    closeNodeContextMenu();
  });

  addSubItem("Move to bottom", function () {
    moveNodeWithinSiblings(id, "bottom");
    closeNodeContextMenu();
  });
});


function addDisabledItem(label) {
  var div = document.createElement("div");
  div.textContent = label;
  div.style.padding = "8px 10px";
  div.style.color = "#6b7280";
  div.style.userSelect = "none";
  menu.appendChild(div);
}

function addColorSubmenu(label) {
  // Row inside the main context menu
  var row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.padding = "8px 10px";
  row.style.borderRadius = "6px";
  row.style.cursor = "pointer";
  row.style.color = "#111";

  var left = document.createElement("span");
  left.textContent = label;
  var right = document.createElement("span");
  right.textContent = "▸";
  right.style.opacity = "0.7";

  row.appendChild(left);
  row.appendChild(right);

  row.addEventListener("mouseenter", function () { row.style.background = "#f6f8fa"; });
  row.addEventListener("mouseleave", function () { row.style.background = "transparent"; });

  // Create submenu once
  var sub = document.createElement("div");
  sub.className = "node-context-submenu";
  sub.style.position = "fixed";
  sub.style.display = "none";
  sub.style.zIndex = "10000";
  sub.style.minWidth = "240px";
  sub.style.background = "#fff";
  sub.style.border = "1px solid #d0d7de";
  sub.style.borderRadius = "8px";
  sub.style.boxShadow = "0 8px 24px rgba(0,0,0,0.14)";
  sub.style.padding = "6px";
  sub.style.fontSize = "13px";
  sub.style.color = "#111";

  // Save reference so closeNodeContextMenu can hide it
  nodeContextSubmenuEl = sub;

  function buildSubmenu() {
    sub.innerHTML = "";

    var id = contextNodeId;
    var n = nodes.find(function (x) { return x.id === id; });
    if (!n) return;

    function addSubItem(text, onClick) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      btn.style.display = "block";
      btn.style.width = "100%";
      btn.style.textAlign = "left";
      btn.style.padding = "8px 10px";
      btn.style.border = "0";
      btn.style.background = "transparent";
      btn.style.cursor = "pointer";
      btn.style.borderRadius = "6px";
      btn.style.color = "#111";
      btn.addEventListener("mouseenter", function () { btn.style.background = "#f6f8fa"; });
      btn.addEventListener("mouseleave", function () { btn.style.background = "transparent"; });
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      sub.appendChild(btn);
    }

    // No colour
    addSubItem("No colour", function () {
      n.color = "";
      updateAllViews();
      closeNodeContextMenu();
    });

    var hr = document.createElement("div");
    hr.style.height = "1px";
    hr.style.background = "#eaeef2";
    hr.style.margin = "6px 0";
    sub.appendChild(hr);

    if (!colorOptions || !colorOptions.length) {
      var msg = document.createElement("div");
      msg.textContent = "No colours defined (add some in the sidebar).";
      msg.style.padding = "8px 10px";
      msg.style.color = "#6b7280";
      msg.style.userSelect = "none";
      sub.appendChild(msg);
      return;
    }

    colorOptions.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.gap = "8px";
      btn.style.width = "100%";
      btn.style.textAlign = "left";
      btn.style.padding = "8px 10px";
      btn.style.border = "0";
      btn.style.background = "transparent";
      btn.style.cursor = "pointer";
      btn.style.borderRadius = "6px";
      btn.style.color = "#111";
      btn.addEventListener("mouseenter", function () { btn.style.background = "#f6f8fa"; });
      btn.addEventListener("mouseleave", function () { btn.style.background = "transparent"; });

      var sw = document.createElement("span");
      sw.style.width = "12px";
      sw.style.height = "12px";
      sw.style.borderRadius = "3px";
      sw.style.border = "1px solid #d0d7de";
      sw.style.background = opt.value;

      var txt = document.createElement("span");
      txt.textContent = opt.label + " (" + opt.value + ")";

      btn.appendChild(sw);
      btn.appendChild(txt);

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        n.color = opt.value;
        updateAllViews();
        closeNodeContextMenu();
      });

      sub.appendChild(btn);
    });
  }

  function positionSubmenu() {
    var r = row.getBoundingClientRect();
    sub.style.display = "block"; // show so we can measure
    var sr = sub.getBoundingClientRect();

    var x = r.right + 6;
    var y = r.top;

    var maxX = window.innerWidth - sr.width - 8;
    var maxY = window.innerHeight - sr.height - 8;

    if (x > maxX) x = r.left - sr.width - 6; // flip left if needed
    if (y > maxY) y = maxY;

    sub.style.left = x + "px";
    sub.style.top = y + "px";
  }

  // Hover open/close with a small grace period
  var hideTimer = null;
  function show() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    buildSubmenu();
    positionSubmenu();
  }
  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      sub.style.display = "none";
    }, 180);
  }

  row.addEventListener("mouseenter", show);
  row.addEventListener("mouseleave", scheduleHide);
  sub.addEventListener("mouseenter", function () {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });
  sub.addEventListener("mouseleave", scheduleHide);

  sub.addEventListener("click", function (e) { e.stopPropagation(); });

  menu.appendChild(row);
  document.body.appendChild(sub);
}
addColorSubmenu("Change colour");
  addDivider();


  addItem("Delete…", function (id) {
  if (!id) return;
  deleteNode(id);
});

  document.body.appendChild(menu);
  nodeContextMenuEl = menu;

menu.addEventListener("click", function (e) {
  e.stopPropagation(); // prevent document click handler from closing it first
});

  // Close on click elsewhere / scroll / resize / escape
  document.addEventListener("click", closeNodeContextMenu);
  document.addEventListener("scroll", closeNodeContextMenu, true);
  window.addEventListener("resize", closeNodeContextMenu);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeNodeContextMenu();
  });
}

function openNodeContextMenu(nodeId, clientX, clientY) {
  ensureNodeContextMenu();
  contextNodeId = nodeId;

  nodeContextMenuEl.style.display = "block";

  // Clamp to viewport
  var rect = nodeContextMenuEl.getBoundingClientRect();
  var x = clientX;
  var y = clientY;

  var maxX = window.innerWidth - rect.width - 8;
  var maxY = window.innerHeight - rect.height - 8;

  if (x > maxX) x = maxX;
  if (y > maxY) y = maxY;

  nodeContextMenuEl.style.left = x + "px";
  nodeContextMenuEl.style.top = y + "px";
}

function closeNodeContextMenu() {
  // hide any submenus we created
  var subs = document.querySelectorAll(".node-context-submenu");
  subs.forEach(function (el) { el.style.display = "none"; });

  if (nodeContextSubmenuEl) nodeContextSubmenuEl.style.display = "none";
  if (!nodeContextMenuEl) return;
  nodeContextMenuEl.style.display = "none";
  contextNodeId = null;
}

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", function () {
  console.log("Driver Diagram Tool loaded with header controls and export.");

  var addBtn = document.getElementById("addNodeBtn");
  var clearBtn = document.getElementById("clearAllBtn");
  var downloadBtn = document.getElementById("downloadCsvBtn");
  var uploadInput = document.getElementById("uploadCsvInput");
  var btnSavePortable = document.getElementById("btnSavePortable");
  var addColorBtn =  document.getElementById("addColorBtn");
  var cancelColorEditBtn =  document.getElementById("cancelColorEditBtn");
  var colorLabelInput =  document.getElementById("colorLabelInput");
  var colorValueInput =  document.getElementById("colorValueInput");

  var btnToggleControls = document.getElementById("btnToggleControls");
  var btnHeaderClear = document.getElementById("btnHeaderClear");
  var btnExportPng = document.getElementById("btnExportPng");
  var btnExportPdf = document.getElementById("btnExportPdf");
  var applyAppearanceBtn = document.getElementById("applyAppearanceBtn");
  var btnHelp = document.getElementById("btnHelp");
  var helpOverlay = document.getElementById("helpOverlay");
  var helpCloseBtn = document.getElementById("helpCloseBtn");


// B1.2: Selection bar buttons

var editTextBtn = document.getElementById("diagramEditTextBtn");
var saveTextBtn = document.getElementById("diagramSaveTextBtn");
var cancelTextBtn = document.getElementById("diagramCancelTextBtn");

if (editTextBtn) {
  editTextBtn.addEventListener("click", function () {
    if (selectedDiagramNodeId) {
      editNode(selectedDiagramNodeId);
    }
  });
}

if (saveTextBtn) {
  saveTextBtn.addEventListener(
    "click",
    saveDiagramInlineText
  );
}

if (cancelTextBtn) {
  cancelTextBtn.addEventListener(
    "click",
    cancelDiagramInlineText
  );
}


var exportArea = document.getElementById("exportArea");
if (exportArea) {
  exportArea.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });
}

  if (addBtn) addBtn.addEventListener("click", addNodeFromForm);
  if (clearBtn) clearBtn.addEventListener("click", clearAllNodes);
  if (downloadBtn) downloadBtn.addEventListener("click", downloadCsv);
  if (btnSavePortable) {
    btnSavePortable.addEventListener("click", downloadPortableHtml);
  }
  if (uploadInput) {
    uploadInput.addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) {
        uploadCsv(file);
        e.target.value = "";
      }
    });
  }
  
if (addColorBtn) {
  addColorBtn.addEventListener(
    "click",
    addColorOptionFromForm
  );
}

if (cancelColorEditBtn) {
  cancelColorEditBtn.addEventListener(
    "click",
    cancelColorEdit
  );
}

if (colorLabelInput) {
  colorLabelInput.addEventListener(
    "input",
    handleColorEditorInput
  );
}

if (colorValueInput) {
  colorValueInput.addEventListener(
    "input",
    handleColorEditorInput
  );

  /*
    Some browsers report colour-picker changes using
    the change event rather than input.
  */
  colorValueInput.addEventListener(
    "change",
    handleColorEditorInput
  );
}

  if (btnToggleControls) {
    btnToggleControls.addEventListener("click", toggleControlsVisibility);
  }
  
  if (btnHeaderClear) {
    btnHeaderClear.addEventListener("click", clearAllNodes);
  }
  if (btnExportPng) {
    btnExportPng.addEventListener("click", exportDiagramPng);
  }
  if (btnExportPdf) {
    btnExportPdf.addEventListener("click", exportDiagramPdf);
  }
  if (applyAppearanceBtn) {
    applyAppearanceBtn.addEventListener("click", applyDiagramAppearanceFromInputs);
  }

 // Help / info modal
  if (btnHelp) {
    btnHelp.addEventListener("click", function () {
      openHelpOverlay();
    });	
  }
  if (helpCloseBtn) {
    helpCloseBtn.addEventListener("click", function () {
      closeHelpOverlay();
    });
  }
  if (helpOverlay) {
    // Close when clicking on the dimmed background
    helpOverlay.addEventListener("click", function (e) {
      if (e.target === helpOverlay) {
        closeHelpOverlay();
      }
    });
  }
  // Optional: close with Escape key
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeHelpOverlay();
    }
  });
	
  var btnToggleLegend = document.getElementById("toggleLegendBtn");

  if (btnToggleLegend) {
    btnToggleLegend.addEventListener("click", function () {
      legendVisible = !legendVisible;
      updateLegendVisibility();
    });
  }


  // Set up collapsible sections in controls panel
  setupCollapsibleSections();

/*
  A portable HTML file contains embedded project data.
  A normal copy of the application does not.
*/
var loadedEmbeddedProject =
  loadEmbeddedProjectIfPresent();

if (loadedEmbeddedProject) {
  /*
    Use the appearance settings stored in the portable file.
    Do not read the default HTML input values, because that
    would overwrite the saved settings.
  */
  setAppearanceInputsFromConfig();
  updateAllViews();
} else {
  /*
    Normal application startup.
  */
  ensureDefaultAim();
  applyDiagramAppearanceFromInputs();
  setAppearanceInputsFromConfig();
}

initialiseColorEditor();
ensureNodeContextMenu();

});
