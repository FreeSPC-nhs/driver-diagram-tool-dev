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
  fontBold: false,
  connectionStyle: "bezier"
};


/* B2.5: Supported connection styles */

function normaliseConnectionStyle(value) {
  if (
    value === "straight" ||
    value === "orthogonal" ||
    value === "bezier"
  ) {
    return value;
  }

  // Compatibility with diagrams saved before B2.5.
  return "bezier";
}


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
  overlay.className = "diagram-measure-editor-overlay";
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
    if (e.key !== "Escape") return;

    e.preventDefault();
    e.stopPropagation();

    if (overlay.parentNode) {
      overlay.remove();
    }
  }

  // The listener is removed automatically with the editor.
  overlay.addEventListener("keydown", escHandler);
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
overlay.className = "diagram-measure-editor-overlay";
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

  
  // B2.4: Delete the measure directly from its editor.
  var deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete measure";
  deleteBtn.title = "Delete this measure";
  deleteBtn.style.padding = "8px 12px";
  deleteBtn.style.marginRight = "auto";
  deleteBtn.style.borderRadius = "8px";
  deleteBtn.style.border = "1px solid #b91c1c";
  deleteBtn.style.background = "#ffffff";
  deleteBtn.style.color = "#b91c1c";
  deleteBtn.style.cursor = "pointer";

  deleteBtn.addEventListener("click", function () {
    // Reuse the existing confirmation and deletion logic.
    deleteMeasureOnNode(nodeId, measureIndex);

    // Keep the editor open if deletion was cancelled.
    // Close it only if this exact measure was removed.
    if (n.measures.indexOf(m) === -1) {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }
  });

  btnRow.appendChild(deleteBtn);
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);

  dialog.appendChild(btnRow);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  setTimeout(function () { textInput.focus(); }, 0);


  function escHandler(e) {
    if (e.key !== "Escape") return;

    e.preventDefault();
    e.stopPropagation();

    if (overlay.parentNode) {
      overlay.remove();
    }
  }

  // The listener is removed automatically with the editor.
  overlay.addEventListener("keydown", escHandler);
}


/* B4.2d — Reorder measures within their own element. */

var draggingDiagramMeasure = null;
var diagramMeasureDropRow = null;

function clearDiagramMeasureDropMarker() {
  if (diagramMeasureDropRow) {
    diagramMeasureDropRow.classList.remove(
      "diagram-measure-drop-before",
      "diagram-measure-drop-after"
    );
    diagramMeasureDropRow = null;
  }
}

function reorderMeasuresWithinNode(
  nodeId, fromIndex, toIndex, placeAfter
) {
  var node = nodes.find(function (n) {
    return n.id === nodeId;
  });

  if (
    !node ||
    !Array.isArray(node.measures) ||
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= node.measures.length ||
    toIndex >= node.measures.length ||
    activeDiagramTextEdit ||
    document.querySelector(
      "dialog[open], .diagram-measure-editor-overlay"
    )
  ) {
    return false;
  }

  var measures = node.measures;
  var previous = measures.slice();

  // Remember which measure was selected, not just its index.
  var selected =
    selectedDiagramMeasure &&
    selectedDiagramMeasure.nodeId === nodeId
      ? measures[selectedDiagramMeasure.index]
      : null;

  var target = measures[toIndex];
  var moved = measures.splice(fromIndex, 1)[0];

  measures.splice(
    measures.indexOf(target) + (placeAfter ? 1 : 0),
    0,
    moved
  );

  // No history entry for a drag that changed nothing.
  if (measures.every(function (m, i) {
    return m === previous[i];
  })) {
    return false;
  }

  // Keep selection attached to the same measure.
  if (selected) {
    selectedDiagramMeasure.index =
      measures.indexOf(selected);
  }

  closeMeasureContextMenu();

  // A completed move creates one Undo entry.
  updateAllViews();
  return true;
}

function enableMeasureReordering(wrap, node) {
  if (!Array.isArray(node.measures) ||
      node.measures.length < 2) return;

  var rows = Array.from(
    wrap.querySelectorAll(".diagram-measure-row")
  );

  rows.forEach(function (row, index) {
    row.draggable = true;
    row.classList.add("diagram-measure-sortable");

    row.title =
      "Drag to reorder. Alt + Up/Down also moves this measure.";


    row.addEventListener("dragstart", function (event) {
      if (
        activeDiagramTextEdit ||
        document.querySelector(
          "dialog[open], .diagram-measure-editor-overlay"
        )
      ) {
        event.preventDefault();
        return;
      }

      draggingDiagramMeasure = {
        nodeId: node.id,
        index: index
      };

      row.classList.add("diagram-measure-dragging");
      closeMeasureContextMenu();
      event.stopPropagation();

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          "text/plain",
          "measure:" + node.id + ":" + index
        );
      }
    });

    row.addEventListener("dragend", function () {
      draggingDiagramMeasure = null;
      clearDiagramMeasureDropMarker();
      row.classList.remove("diagram-measure-dragging");
    });

    // Keyboard alternative: Alt + Up or Down.
    row.addEventListener("keydown", function (event) {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (
          event.key !== "ArrowUp" &&
          event.key !== "ArrowDown"
        )
      ) return;

      event.preventDefault();
      event.stopPropagation();

      var step =
        event.key === "ArrowUp" ? -1 : 1;

      var nextIndex = index + step;

      if (
        nextIndex < 0 ||
        nextIndex >= rows.length
      ) return;

      if (reorderMeasuresWithinNode(
        node.id, index, nextIndex, step > 0
      )) {
        // Restore focus after rendering recreates the rows.
        document.querySelectorAll(
          ".diagram-measure-row"
        ).forEach(function (candidate) {
          if (
            candidate.dataset.nodeId === node.id &&
            Number(candidate.dataset.measureIndex) ===
              nextIndex
          ) {
            candidate.focus();
          }
        });
      }
    });
  });

  // Find the nearest measure, including small gaps.
  function closestRow(event) {
    var nearest = null;
    var distance = Infinity;

    rows.forEach(function (row) {
      var rect = row.getBoundingClientRect();

      var gap = Math.max(
        rect.top - event.clientY,
        0,
        event.clientY - rect.bottom
      );

      if (gap < distance) {
        distance = gap;
        nearest = {
          row: row,
          index: Number(row.dataset.measureIndex),
          after: event.clientY >=
            rect.top + rect.height / 2
        };
      }
    });

    return nearest;
  }

  wrap.addEventListener("dragover", function (event) {
    if (
      !draggingDiagramMeasure ||
      draggingDiagramMeasure.nodeId !== node.id
    ) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    var target = closestRow(event);
    clearDiagramMeasureDropMarker();

    if (
      !target ||
      target.index === draggingDiagramMeasure.index
    ) return;

    diagramMeasureDropRow = target.row;

    target.row.classList.add(
      target.after
        ? "diagram-measure-drop-after"
        : "diagram-measure-drop-before"
    );
  });

  wrap.addEventListener("drop", function (event) {
    if (
      !draggingDiagramMeasure ||
      draggingDiagramMeasure.nodeId !== node.id
    ) return;

    event.preventDefault();
    event.stopPropagation();

    var source = draggingDiagramMeasure;
    var target = closestRow(event);

    draggingDiagramMeasure = null;
    clearDiagramMeasureDropMarker();

    if (target) {
      reorderMeasuresWithinNode(
        node.id,
        source.index,
        target.index,
        target.after
      );
    }
  });
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

if (selectedDiagramMeasure &&
    selectedDiagramMeasure.nodeId === nodeId) {
  clearSelectedDiagramMeasure();
}

  n.measures.splice(measureIndex, 1);
  updateAllViews();
}

function clearMeasuresFromNode(nodeId) {
  var n = nodes.find(function (x) { return x.id === nodeId; });
  if (!n) return;
  if (!n.measures || !n.measures.length) return;

  if (!window.confirm("Remove all measures from this item?")) return;

if (selectedDiagramMeasure &&
    selectedDiagramMeasure.nodeId === nodeId) {
  clearSelectedDiagramMeasure();
}
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


/* B3.2 — Align coloured boxes by their vertical centres.
   Reserve the full item height, including measures. */

function computeTreeLayout(byLevel, boxH, gap, heightById, boxHeightById) {
  var aims = byLevel.aim || [];
  var primaries = byLevel.primary || [];
  var secondaries = byLevel.secondary || [];
  var changes = byLevel.change || [];

  var secondariesByPrimary = Object.create(null);
  var changesBySecondary = Object.create(null);

  secondaries.forEach(function (n) {
    var key = n.parentId || "";
    (secondariesByPrimary[key] ||
      (secondariesByPrimary[key] = [])).push(n);
  });

  changes.forEach(function (n) {
    var key = n.parentId || "";
    (changesBySecondary[key] ||
      (changesBySecondary[key] = [])).push(n);
  });

  function itemH(id) {
    var h = Number(heightById && heightById[id]);
    return h > 0 ? Math.max(boxH, h) : boxH;
  }

  function colourH(id) {
    var h = Number(boxHeightById && boxHeightById[id]);
    return h > 0
      ? Math.min(itemH(id), h)
      : Math.min(itemH(id), boxH);
  }

  function shiftPositions(positions, distance) {
    Object.keys(positions).forEach(function (id) {
      positions[id] += distance;
    });
  }

  // Lay out a secondary driver and its change ideas.
  function secondaryBranch(sec) {
    var children = changesBySecondary[sec.id] || [];
    var positions = Object.create(null);
    var y = 0;
    var firstCentre = null;
    var lastCentre = null;

    children.forEach(function (child, index) {
      positions[child.id] = y;

      var centre = y + colourH(child.id) / 2;
      if (index === 0) firstCentre = centre;
      lastCentre = centre;

      y += itemH(child.id);
      if (index < children.length - 1) y += gap;
    });

    var targetCentre = children.length
      ? (firstCentre + lastCentre) / 2
      : colourH(sec.id) / 2;

    var secTop = targetCentre - colourH(sec.id) / 2;

    // Keep the whole branch within its allocated area.
    if (secTop < 0) {
      shiftPositions(positions, -secTop);
      y -= secTop;
      secTop = 0;
    }

    positions[sec.id] = secTop;

    return {
      positions: positions,
      centre: secTop + colourH(sec.id) / 2,
      height: Math.max(secTop + itemH(sec.id), y)
    };
  }

  // Lay out a primary driver and its secondary branches.
  function primaryBranch(primary) {
    var children = secondariesByPrimary[primary.id] || [];
    var positions = Object.create(null);
    var y = 0;
    var firstCentre = null;
    var lastCentre = null;

    children.forEach(function (sec, index) {
      var branch = secondaryBranch(sec);

      Object.keys(branch.positions).forEach(function (id) {
        positions[id] = y + branch.positions[id];
      });

      var centre = y + branch.centre;
      if (index === 0) firstCentre = centre;
      lastCentre = centre;

      y += branch.height;
      if (index < children.length - 1) y += gap;
    });

    var targetCentre = children.length
      ? (firstCentre + lastCentre) / 2
      : colourH(primary.id) / 2;

    var primaryTop =
      targetCentre - colourH(primary.id) / 2;

    if (primaryTop < 0) {
      shiftPositions(positions, -primaryTop);
      y -= primaryTop;
      primaryTop = 0;
    }

    positions[primary.id] = primaryTop;

    return {
      positions: positions,
      centre: primaryTop + colourH(primary.id) / 2,
      height: Math.max(primaryTop + itemH(primary.id), y)
    };
  }

  // Stack the primary branches.
  var topById = Object.create(null);
  var y = 0;
  var firstPrimaryCentre = null;
  var lastPrimaryCentre = null;

  primaries.forEach(function (primary, index) {
    var branch = primaryBranch(primary);

    Object.keys(branch.positions).forEach(function (id) {
      topById[id] = y + branch.positions[id];
    });

    var centre = y + branch.centre;
    if (index === 0) firstPrimaryCentre = centre;
    lastPrimaryCentre = centre;

    y += branch.height;
    if (index < primaries.length - 1) y += gap;
  });

  var totalHeight = y;

  // Centre the aim against the primary driver group.
  if (aims.length) {
    var aim = aims[0];

    var targetAimCentre = primaries.length
      ? (firstPrimaryCentre + lastPrimaryCentre) / 2
      : colourH(aim.id) / 2;

    var aimTop =
      targetAimCentre - colourH(aim.id) / 2;

    if (aimTop < 0) {
      shiftPositions(topById, -aimTop);
      totalHeight -= aimTop;
      aimTop = 0;
    }

    topById[aim.id] = aimTop;

    totalHeight = Math.max(
      totalHeight,
      aimTop + itemH(aim.id)
    );
  }

  // Preserve visibility of unparented elements.
  var fallbackY = totalHeight;

  secondaries.forEach(function (sec) {
    if (topById[sec.id] != null) return;

    if (fallbackY > 0) fallbackY += gap;

    var branch = secondaryBranch(sec);

    Object.keys(branch.positions).forEach(function (id) {
      topById[id] = fallbackY + branch.positions[id];
    });

    fallbackY += branch.height;
  });

  changes.forEach(function (change) {
    if (topById[change.id] != null) return;

    if (fallbackY > 0) fallbackY += gap;

    topById[change.id] = fallbackY;
    fallbackY += itemH(change.id);
  });

  totalHeight = Math.max(totalHeight, fallbackY, boxH);

  return {
    topById: topById,
    totalHeight: totalHeight
  };
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


function renderDiagram() {  var canvas = document.getElementById("diagramCanvas");
  var columnsContainer = document.getElementById("diagramColumns");

  var svg = document.getElementById("diagramConnections");
  if (!canvas || !columnsContainer || !svg) return;

  // B3.4c: Enable more forgiving drop targets.
  installForgivingDiagramDropZones(canvas);


// Prevent the browser context menu anywhere inside the diagram area

[canvas, columnsContainer, svg].forEach(function (el) {
  // Register only once per persistent element.
  if (el._diagramContextMenuGuardInstalled) return;
  el._diagramContextMenuGuardInstalled = true;

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


// Calculate layout using the current appearance settings.
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
    128 + estimateMeasuresHeightPx(
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


/* B3.2 — Track the coloured box height separately
   from the full element height (box plus measures). */

var boxHeightById = {};

nodes.forEach(function (n) {
  // Reserve space for the temporary inline text editor.
  if (activeDiagramTextEdit &&
      activeDiagramTextEdit.id === n.id) {
    boxHeightById[n.id] = Math.max(boxH, 128);
    return;
  }

  // Prefer heights measured from the rendered diagram.
  if (measuredBoxHeightsById[n.id] > 0) {
    boxHeightById[n.id] = measuredBoxHeightsById[n.id];
    return;
  }

  // Otherwise estimate the coloured box height.
  boxHeightById[n.id] = n.autoSize
    ? estimateAutoHeightPx(
        n.text || "",
        fs,
        320,
        boxH
      )
    : boxH;
});

// Use both complete item heights and coloured-box heights.
var layout = computeTreeLayout(
  byLevel,
  boxH,
  gap,
  heightById,
  boxHeightById
);


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

// B3.4b: Enable mouse drag-to-reorder for siblings.
enableDiagramNodeDrag(box, node);


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


/* B4.2b.1 — Preserve staged colours during diagram redraws. */

var displayedNodeColour = node.color || "";

// While editing, use the selected preview colour
// instead of the previously saved colour.
if (
  activeDiagramTextEdit &&
  activeDiagramTextEdit.id === node.id &&
  Object.prototype.hasOwnProperty.call(
    activeDiagramTextEdit, "pendingColour"
  )
) {
  displayedNodeColour =
    activeDiagramTextEdit.pendingColour || "";
}

// Apply the colour currently being displayed.
if (displayedNodeColour) {
  box.style.backgroundColor = displayedNodeColour;
  box.style.borderColor = "#999";
  box.style.color =
    getContrastingTextColor(displayedNodeColour);
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

  if (displayedNodeColour) {
  leftBtn.style.backgroundColor = displayedNodeColour;
  leftBtn.style.borderColor = displayedNodeColour;
  leftBtn.style.color = getContrastingTextColor(displayedNodeColour);
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

  if (displayedNodeColour) {
  rightBtn.style.backgroundColor = displayedNodeColour;
  rightBtn.style.borderColor = displayedNodeColour;
  rightBtn.style.color = getContrastingTextColor(displayedNodeColour);
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

// B4.2c: Contextual delete button for the selected element.
var deleteBtn = document.createElement("button");
deleteBtn.type = "button";
deleteBtn.className = "diagram-delete-button";
deleteBtn.title = "Delete element";
deleteBtn.setAttribute(
  "aria-label",
  "Delete " + getLevelLabel(node.level) + ": " + node.text
);

deleteBtn.innerHTML =
  '<svg viewBox="0 0 24 24" width="15" height="15" ' +
  'fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" ' +
  'aria-hidden="true" focusable="false">' +
  '<path d="M3 6h18"/>' +
  '<path d="M8 6V4h8v2"/>' +
  '<path d="M19 6l-1 14H6L5 6"/>' +
  '<path d="M10 10v7M14 10v7"/>' +
  '</svg>';

deleteBtn.addEventListener("click", function (event) {
  event.preventDefault();
  event.stopPropagation();

  // Never delete a box while text editing is in progress.
  if (activeDiagramTextEdit) return;

  // Reuse the existing confirmation and dependent-item cleanup.
  deleteNode(node.id);
});

box.appendChild(deleteBtn);


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

  if (activeDiagramTextEdit.isNew) {
    inlineInput.placeholder =
      "Enter " + getLevelLabel(node.level) + " text";
  }

  inlineInput.setAttribute(
    "aria-label",
    "Edit " + getLevelLabel(node.level) + " text"
  );

  inlineInput.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  inlineInput.addEventListener("input", function () {
    activeDiagramTextEdit.draft = inlineInput.value;

    var inlineFeedback = document.getElementById(
      "diagramInlineTextFeedback"
    );

    if (inlineFeedback) {
      inlineFeedback.textContent = "";
    }

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


  // B3.4a: Keep Save and Cancel inside the edited box.
  var inlineEditor = document.createElement("div");
  inlineEditor.className = "diagram-inline-editor";

  var inlineActions = document.createElement("div");
  inlineActions.className = "diagram-inline-actions";

  var inlineSave = document.createElement("button");
  inlineSave.type = "button";
  inlineSave.className = "diagram-inline-save";
  inlineSave.textContent = "✓";
  inlineSave.title = "Save text (Ctrl+Enter)";
  inlineSave.setAttribute("aria-label", "Save text changes");

  inlineSave.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    saveDiagramInlineText();
  });

  var inlineCancel = document.createElement("button");
  inlineCancel.type = "button";
  inlineCancel.className = "diagram-inline-cancel";
  inlineCancel.textContent = "×";
  inlineCancel.title = "Cancel editing (Escape)";
  inlineCancel.setAttribute("aria-label", "Cancel text changes");

  inlineCancel.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    cancelDiagramInlineText();
  });

  var inlineFeedback = document.createElement("span");
  inlineFeedback.id = "diagramInlineTextFeedback";
  inlineFeedback.className = "diagram-inline-feedback";
  inlineFeedback.setAttribute("role", "status");


  // B4.2b — Colour picker at the bottom-left of the editor.
  var inlineColourButton = document.createElement("button");
  inlineColourButton.type = "button";
  inlineColourButton.className = "diagram-inline-colour-button";
  inlineColourButton.textContent = "🎨";
  inlineColourButton.title = "Change box colour";
  inlineColourButton.setAttribute(
    "aria-label", "Choose box colour"
  );
  inlineColourButton.setAttribute("aria-haspopup", "true");

  inlineColourButton.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    showInlineColourMenu(node.id, inlineColourButton);
  });

  inlineActions.appendChild(inlineColourButton);
  inlineActions.appendChild(inlineSave);
  inlineActions.appendChild(inlineCancel);

  inlineEditor.appendChild(inlineInput);
  inlineEditor.appendChild(inlineActions);
  inlineEditor.appendChild(inlineFeedback);

  box.appendChild(inlineEditor);

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

  
node.measures.forEach(function (m, measureIndex) {
  var row = document.createElement("div");

  row.className = "diagram-measure-row";
  row.dataset.nodeId = node.id;
  row.dataset.measureIndex = String(measureIndex);
  row.tabIndex = 0;
  row.setAttribute("role", "button");

  var meta = getMeasureTypeMeta((m && m.type) || "");
  var measureText = (m && m.text) ? m.text : "";

  row.setAttribute(
    "aria-label",
    meta.label + ": " + measureText
  );

  var isSelected = !!selectedDiagramMeasure &&
    selectedDiagramMeasure.nodeId === node.id &&
    selectedDiagramMeasure.index === measureIndex;

  row.setAttribute(
    "aria-pressed",
    isSelected ? "true" : "false"
  );

  if (isSelected) {
    row.classList.add("diagram-measure-selected");
  }

  row.style.display = "flex";
  row.style.gap = "6px";
  row.style.alignItems = "flex-start";

  var icon = document.createElement("span");
  icon.textContent = meta.icon;
  icon.style.marginTop = "1px";
  icon.style.color = meta.color;
  icon.title = meta.label;

  var txt = document.createElement("span");
  txt.textContent = measureText;

  row.appendChild(icon);
  row.appendChild(txt);

  // Single click: select or deselect.
  row.addEventListener("click", function (e) {
    e.stopPropagation();
    closeMeasureContextMenu();
    selectDiagramMeasure(node.id, measureIndex, true);
  });

  // Double-click: edit the specific measure.
  row.addEventListener("dblclick", function (e) {
    e.preventDefault();
    e.stopPropagation();

    if (activeDiagramTextEdit) return;

    selectDiagramMeasure(node.id, measureIndex, false);
    editMeasureOnNode(node.id, measureIndex);
  });

  // Right-click: measure-specific actions.
  row.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    e.stopPropagation();

    if (activeDiagramTextEdit) return;

    selectDiagramMeasure(node.id, measureIndex, false);

    openMeasureContextMenu(
      node.id, measureIndex, e.clientX, e.clientY
    );
  });

  // Keyboard alternatives.
  row.addEventListener("keydown", function (e) {
    if (e.key === " ") {
      e.preventDefault();
      selectDiagramMeasure(node.id, measureIndex, true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectDiagramMeasure(node.id, measureIndex, false);
      editMeasureOnNode(node.id, measureIndex);
    } else if (
      e.key === "ContextMenu" ||
      (e.shiftKey && e.key === "F10")
    ) {
      e.preventDefault();

      selectDiagramMeasure(node.id, measureIndex, false);

      var bounds = row.getBoundingClientRect();

      openMeasureContextMenu(
        node.id, measureIndex, bounds.left, bounds.bottom
      );
    }
  });

  measuresWrap.appendChild(row);
});

// B4.2d — Enable dragging within this element's measure list.
enableMeasureReordering(measuresWrap, node);

  item.appendChild(measuresWrap);
}


/* B2.3 — Contextual Add measure button */

item.classList.toggle(
  "diagram-no-measures",
  !node.measures || node.measures.length === 0
);

var quickAddMeasure = document.createElement("button");
quickAddMeasure.type = "button";
quickAddMeasure.className = "diagram-quick-add-measure";
quickAddMeasure.title = "Add measure";

quickAddMeasure.setAttribute(
  "aria-label",
  "Add measure to " + node.text
);


var measureIcon = document.createElement("span");
measureIcon.className = "quick-add-measure-icon";
measureIcon.setAttribute("aria-hidden", "true");

measureIcon.innerHTML =
  '<svg viewBox="0 0 20 20" width="15" height="15" ' +
  'fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round" ' +
  'focusable="false">' +
  '<path d="M3 16V10M8 16V5M13 16V8M18 16V3"/>' +
  '<path d="M2 17h17"/>' +
  '</svg>';

var caption = document.createElement("span");
caption.className = "quick-add-measure-label";
caption.textContent = "Add measure";

quickAddMeasure.appendChild(measureIcon);
quickAddMeasure.appendChild(caption);

quickAddMeasure.addEventListener("click", function (e) {
  e.preventDefault();
  e.stopPropagation();

  // Never interrupt unfinished editing.
  if (
    activeDiagramTextEdit ||
    document.querySelector(
      "dialog[open], .diagram-measure-editor-overlay"
    )
  ) {
    return;
  }

  // Reuse the existing, tested Add measure editor.
  addMeasureToNode(node.id);
});

item.appendChild(quickAddMeasure);


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

    // If no re-layout is needed, draw the connections.
    drawConnections(canvas, svg);  });
}
}




/* B3.3: Individual connection selection */

var selectedDiagramConnection = null;

function normaliseConnectionOverride(value) {
  return (
    value === "straight" ||
    value === "orthogonal" ||
    value === "bezier"
  ) ? value : "";
}

function findDiagramConnection(fromId, toId) {
  return connections.find(function (c) {
    return c.fromId === fromId && c.toId === toId;
  });
}

function updateDiagramConnectionBar() {
  var bar = document.getElementById("connectionFormatBar");
  if (!bar) return;

  var selected = selectedDiagramConnection;
  var connection = selected && findDiagramConnection(
    selected.fromId, selected.toId
  );

  if (!connection) {
    selectedDiagramConnection = null;
    bar.hidden = true;
    return;
  }

  var from = nodes.find(function (n) {
    return n.id === connection.fromId;
  });

  var to = nodes.find(function (n) {
    return n.id === connection.toId;
  });

  if (!from || !to) {
    selectedDiagramConnection = null;
    bar.hidden = true;
    return;
  }


  bar.hidden = false;

  var label = document.getElementById(
    "connectionFormatLabel"
  );

  label.textContent = from.text + " → " + to.text;
  label.title = label.textContent;

  var currentStyle =
    normaliseConnectionOverride(connection.style) ||
    "default";

  document.getElementById(
    "connectionFormatSelect"
  ).value = currentStyle;

  bar.querySelectorAll(
    "[data-connection-style]"
  ).forEach(function (button) {

    var active =
      button.getAttribute("data-connection-style") ===
      currentStyle;

    button.classList.toggle("is-active", active);
    button.setAttribute(
      "aria-pressed",
      active ? "true" : "false"
    );
  });
}

function clearDiagramConnectionSelection() {
  if (!selectedDiagramConnection) return;

  selectedDiagramConnection = null;
  updateDiagramConnectionBar();

  var canvas = document.getElementById("diagramCanvas");
  var svg = document.getElementById("diagramConnections");

  if (canvas && svg) {
    drawConnections(canvas, svg);
  }
}


function positionConnectionFormatBar(clientX, clientY) {
  var bar = document.getElementById("connectionFormatBar");
  if (!bar || bar.hidden) return;

  var rect = bar.getBoundingClientRect();

  var x = Number.isFinite(clientX) ? clientX : 20;
  var y = Number.isFinite(clientY) ? clientY : 20;

  // Prefer positioning to the right of the click.
  var left = x + 12;

  if (left + rect.width > window.innerWidth - 8) {
    left = x - rect.width - 12;
  }

  left = Math.max(
    8,
    Math.min(left, window.innerWidth - rect.width - 8)
  );

  // Prefer below the click, but move above if needed.
  var top = y + 12;

  if (top + rect.height > window.innerHeight - 8) {
    top = y - rect.height - 12;
  }

  top = Math.max(
    8,
    Math.min(top, window.innerHeight - rect.height - 8)
  );

  bar.style.left = left + "px";
  bar.style.top = top + "px";
}

function selectDiagramConnection(
  fromId, toId, clientX, clientY
) {

  if (
    activeDiagramTextEdit ||
    document.querySelector(
      "dialog[open], .diagram-measure-editor-overlay"
    )
  ) return;

  if (!findDiagramConnection(fromId, toId)) return;

  var same = selectedDiagramConnection &&
    selectedDiagramConnection.fromId === fromId &&
    selectedDiagramConnection.toId === toId;

  selectedDiagramConnection = same ? null : {
    fromId: fromId,
    toId: toId
  };

  selectedDiagramNodeId = null;
  clearSelectedDiagramMeasure();
  closeMeasureContextMenu();
  closeNodeContextMenu();

  document.querySelectorAll(
    ".diagram-node.diagram-selected"
  ).forEach(function (box) {
    box.classList.remove("diagram-selected");
  });

  updateDiagramSelectionBar();
  updateDiagramConnectionBar();

  if (selectedDiagramConnection) {
    positionConnectionFormatBar(clientX, clientY);
  }

  var canvas = document.getElementById("diagramCanvas");  var svg = document.getElementById("diagramConnections");

  if (canvas && svg) {
    drawConnections(canvas, svg);
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
    
// B2.5: Draw the selected connection style.
var connectionStyle = normaliseConnectionOverride(conn.style) ||
  normaliseConnectionStyle(diagramAppearance.connectionStyle);

var d;

if (connectionStyle === "straight") {

  // Direct line between the two boxes.
  d = "M " + x1 + " " + y1 +
      " L " + x2 + " " + y2;

} else if (connectionStyle === "orthogonal") {

  // Horizontal, vertical, horizontal.
  // The bends occur halfway between columns.
  d = "M " + x1 + " " + y1 +
      " H " + midX +
      " V " + y2 +
      " H " + x2;

} else {

  // Original smooth cubic Bézier connection.
  d = "M " + x1 + " " + y1 +
      " C " + midX + " " + y1 +
      ", " + midX + " " + y2 +
      ", " + x2 + " " + y2;

}


    
    var selected = !!selectedDiagramConnection &&
      selectedDiagramConnection.fromId === conn.fromId &&
      selectedDiagramConnection.toId === conn.toId;

    path.setAttribute("class", "diagram-connection-visible");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute(
      "stroke",
      selected ? "#005eb8" : "#666"
    );
    path.setAttribute(
      "stroke-width",
      selected ? "3.5" : "2.5"
    );
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute(
      "data-selected",
      selected ? "true" : "false"
    );

    svg.appendChild(path);

    // A wider invisible path makes selecting easier.
    var hit = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );

    hit.setAttribute("class", "diagram-connection-hit");
    hit.setAttribute("d", d);
    hit.setAttribute("fill", "none");
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "16");
    hit.setAttribute("pointer-events", "stroke");
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("role", "button");

    hit.setAttribute(
      "aria-pressed",
      selected ? "true" : "false"
    );

    var fromNode = nodes.find(function (n) {
      return n.id === conn.fromId;
    });

    var toNode = nodes.find(function (n) {
      return n.id === conn.toId;
    });

    hit.setAttribute(
      "aria-label",
      "Select connection from " +
      (fromNode ? fromNode.text : conn.fromId) +
      " to " +
      (toNode ? toNode.text : conn.toId)
    );

        hit.addEventListener("click", function (event) {
      event.stopPropagation();

      selectDiagramConnection(
        conn.fromId,
        conn.toId,
        event.clientX,
        event.clientY
      );
    });

    hit.addEventListener("keydown", function (event) {
      if (
        event.key !== "Enter" &&
        event.key !== " "
      ) return;

      event.preventDefault();
      event.stopPropagation();

      
      var bounds = hit.getBoundingClientRect();

      selectDiagramConnection(
        conn.fromId,
        conn.toId,
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2
      );

      var firstChoice = document.querySelector(
        "#connectionFormatBar [data-connection-style]"
      );

      if (firstChoice && selectedDiagramConnection) {
        firstChoice.focus();
      }

    });

    svg.appendChild(hit);

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


/* B3.4b: Drag sibling nodes without changing their relationships. */

var diagramDraggingNodeId = null;
var diagramDragTargetBox = null;

function clearDiagramDragMarker() {
  if (diagramDragTargetBox) {
    diagramDragTargetBox.classList.remove(
      "diagram-drop-before", "diagram-drop-after"
    );
    diagramDragTargetBox = null;
  }

  document.querySelectorAll(".diagram-dragging").forEach(
    function (box) {
      box.classList.remove("diagram-dragging");
    }
  );
}

function reorderDiagramSibling(fromId, toId, placeAfter) {
  var source = nodes.find(function (n) {
    return n.id === fromId;
  });

  var target = nodes.find(function (n) {
    return n.id === toId;
  });

  if (!source || !target || source.id === target.id ||
      source.level !== target.level ||
      (source.parentId || "") !== (target.parentId || "")) {
    return;
  }

  var slots = [];
  var group = [];

  nodes.forEach(function (n, index) {
    if (n.level === source.level &&
        (n.parentId || "") === (source.parentId || "")) {
      slots.push(index);
      group.push(n);
    }
  });

  var before = group.map(function (n) {
    return n.id;
  }).join("|");

  var fromIndex = group.findIndex(function (n) {
    return n.id === fromId;
  });

  if (fromIndex < 0) return;

  var moved = group.splice(fromIndex, 1)[0];

  var targetIndex = group.findIndex(function (n) {
    return n.id === toId;
  });

  if (targetIndex < 0) return;

  group.splice(
    targetIndex + (placeAfter ? 1 : 0),
    0,
    moved
  );

  if (group.map(function (n) {
    return n.id;
  }).join("|") === before) return;

  slots.forEach(function (slot, index) {
    nodes[slot] = group[index];
  });

  // One completed drag creates one Undo history entry.
  updateAllViews();
}


/* B3.4c — Accept drops in gaps, while keeping parent groups separate. */

function installForgivingDiagramDropZones(canvas) {
  if (canvas._forgivingDropsInstalled) return;
  canvas._forgivingDropsInstalled = true;

  function findDropPosition(event) {
    var source = nodes.find(function (n) {
      return n.id === diagramDraggingNodeId;
    });
    if (!source) return null;

    var levelIndex = levelOrder.indexOf(source.level);
    var columns = document.querySelectorAll(
      "#diagramColumns .diagram-column"
    );
    var column = columns[levelIndex];
    if (!column) return null;

    // Accept the column plus a small margin on either side.
    var area = column.getBoundingClientRect();

    if (event.clientX < area.left - 16 ||
        event.clientX > area.right + 16) {
      return null;
    }

    var closest = null;
    var smallestDistance = Infinity;

    column.querySelectorAll(
      ".diagram-column-stack > .diagram-item"
    ).forEach(function (item) {
      var id = item.getAttribute("data-id");

      var candidate = nodes.find(function (n) {
        return n.id === id;
      });
      if (!candidate) return;

      var rect = item.getBoundingClientRect();

      var distance = Math.max(
        rect.top - event.clientY,
        0,
        event.clientY - rect.bottom
      );

      if (distance < smallestDistance) {
        smallestDistance = distance;
        closest = {
          node: candidate,
          item: item
        };
      }
    });

    // Never mix elements belonging to different parents.
    if (!closest ||
        closest.node.level !== source.level ||
        (closest.node.parentId || "") !==
        (source.parentId || "")) {
      return null;
    }

    var box = closest.item.querySelector(".diagram-node");
    if (!box) return null;

    var boxRect = box.getBoundingClientRect();

    return {
      id: closest.node.id,
      box: box,
      after: event.clientY >=
        boxRect.top + boxRect.height / 2
    };
  }

  function clearDropHighlight() {
    if (diagramDragTargetBox) {
      diagramDragTargetBox.classList.remove(
        "diagram-drop-before",
        "diagram-drop-after"
      );
      diagramDragTargetBox = null;
    }
  }

  function handleDragging(event) {
    if (!diagramDraggingNodeId) return;

    // Handle drag events before the older box-only handlers.
    event.stopPropagation();

    var target = findDropPosition(event);

    if (!target) {
      clearDropHighlight();
      return;
    }

    // Tell the browser this is a valid drop location.
    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    if (target.id === diagramDraggingNodeId) {
      clearDropHighlight();
      return;
    }

    if (diagramDragTargetBox !== target.box) {
      clearDropHighlight();
    }

    diagramDragTargetBox = target.box;

    target.box.classList.toggle(
      "diagram-drop-before",
      !target.after
    );

    target.box.classList.toggle(
      "diagram-drop-after",
      target.after
    );
  }

  canvas.addEventListener(
    "dragenter", handleDragging, true
  );

  canvas.addEventListener(
    "dragover", handleDragging, true
  );

  canvas.addEventListener("drop", function (event) {
    if (!diagramDraggingNodeId) return;

    event.stopPropagation();

    var target = findDropPosition(event);

    if (!target) {
      clearDropHighlight();
      return;
    }

    event.preventDefault();

    var fromId = diagramDraggingNodeId;
    diagramDraggingNodeId = null;

    clearDiagramDragMarker();

    if (target.id !== fromId) {
      reorderDiagramSibling(
        fromId,
        target.id,
        target.after
      );
    }
  }, true);
}

function enableDiagramNodeDrag(box, node) {

  if (node.level === "aim" ||
      getSiblingIdsInOrder(node).length < 2) {
    return;
  }

  box.draggable = true;

  box.addEventListener("dragstart", function (event) {
    if (
      activeDiagramTextEdit ||
      (event.target.closest &&
       event.target.closest("button, textarea, input, select"))
    ) {
      event.preventDefault();
      return;
    }

    diagramDraggingNodeId = node.id;
    box.classList.add("diagram-dragging");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", node.id);
    }
  });

  box.addEventListener("dragover", function (event) {
    var source = nodes.find(function (n) {
      return n.id === diagramDraggingNodeId;
    });

    if (!source ||
        source.id === node.id ||
        source.level !== node.level ||
        (source.parentId || "") !== (node.parentId || "")) {
      return;
    }

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    if (diagramDragTargetBox &&
        diagramDragTargetBox !== box) {
      diagramDragTargetBox.classList.remove(
        "diagram-drop-before", "diagram-drop-after"
      );
    }

    diagramDragTargetBox = box;

    var rect = box.getBoundingClientRect();
    var after = event.clientY > rect.top + rect.height / 2;

    box.classList.toggle("diagram-drop-after", after);
    box.classList.toggle("diagram-drop-before", !after);
  });

  box.addEventListener("drop", function (event) {
    if (!diagramDraggingNodeId ||
        diagramDragTargetBox !== box) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    var fromId = diagramDraggingNodeId;
    var after = box.classList.contains(
      "diagram-drop-after"
    );

    diagramDraggingNodeId = null;
    clearDiagramDragMarker();

    reorderDiagramSibling(fromId, node.id, after);
  });

  box.addEventListener("dragend", function () {
    diagramDraggingNodeId = null;
    clearDiagramDragMarker();
  });
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

var lineInput = document.getElementById("connectionStyleInput");
if (lineInput) {
  diagramAppearance.connectionStyle =
    normaliseConnectionStyle(lineInput.value);
}

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
var lineInput = document.getElementById("connectionStyleInput");
if (lineInput) {
  lineInput.value = normaliseConnectionStyle(
    diagramAppearance.connectionStyle
  );
}
}


/* B3.1 — In-memory diagram undo/redo */

var diagramHistoryStates = [];
var diagramHistoryIndex = -1;
var diagramHistoryReady = false;
var diagramHistoryRestoring = false;
var DIAGRAM_HISTORY_LIMIT = 51; // Current state + up to 50 changes.

function captureDiagramHistoryState() {
  return JSON.stringify({
    nodes: nodes,
    nextId: nextId,
    connections: connections,
    colorOptions: colorOptions,
    columnTitles: columnTitles,
    diagramAppearance: diagramAppearance,
    legendVisible: legendVisible
  });
}

function refreshDiagramHistoryButtons() {
  var undoBtn = document.getElementById("btnDiagramUndo");
  var redoBtn = document.getElementById("btnDiagramRedo");

  if (undoBtn) {
    undoBtn.disabled =
      !diagramHistoryReady || diagramHistoryIndex <= 0;
  }

  if (redoBtn) {
    redoBtn.disabled =
      !diagramHistoryReady ||
      diagramHistoryIndex >= diagramHistoryStates.length - 1;
  }
}

function initialiseDiagramHistory() {
  diagramHistoryStates = [captureDiagramHistoryState()];
  diagramHistoryIndex = 0;
  diagramHistoryReady = true;
  refreshDiagramHistoryButtons();
}

function recordDiagramHistory() {
  if (!diagramHistoryReady || diagramHistoryRestoring) return;

  // New boxes are drafts until confirmed with the tick.
  if (activeDiagramTextEdit &&
      activeDiagramTextEdit.isNew) return;
  var snapshot = captureDiagramHistoryState();

  // Ignore redraws and actions that did not change the diagram.
  if (snapshot === diagramHistoryStates[diagramHistoryIndex]) {
    return;
  }

  // A new edit after Undo discards the old Redo branch.
  diagramHistoryStates =
    diagramHistoryStates.slice(0, diagramHistoryIndex + 1);

  diagramHistoryStates.push(snapshot);

  if (diagramHistoryStates.length > DIAGRAM_HISTORY_LIMIT) {
    diagramHistoryStates.shift();
  }

  diagramHistoryIndex = diagramHistoryStates.length - 1;
  refreshDiagramHistoryButtons();
}

function canRestoreDiagramHistory() {
  // Never lose unfinished text or modal edits.
  if (activeDiagramTextEdit || activeOutlineTextEdit) {
    return false;
  }
  if (document.querySelector(
    "dialog[open], .diagram-measure-editor-overlay"
  )) return false;

  if (document.querySelector("#helpOverlay.is-open")) {
    return false;
  }

  if (editingColorValue && isColorEditorDirty()) {
    return false;
  }

  return true;
}

function restoreDiagramHistory(index) {
  if (!diagramHistoryReady ||
      index < 0 ||
      index >= diagramHistoryStates.length ||
      !canRestoreDiagramHistory()) {
    return;
  }

  diagramHistoryRestoring = true;

  try {
    var state = JSON.parse(diagramHistoryStates[index]);

    nodes = state.nodes;
    nextId = state.nextId;
    connections = state.connections;
    colorOptions = state.colorOptions;
    columnTitles = state.columnTitles;
    diagramAppearance = state.diagramAppearance;
    legendVisible = state.legendVisible;

    // Clear selections that may no longer be valid.
    selectedDiagramNodeId = null;
    selectedDiagramMeasure = null;
    activeDiagramTextEdit = null;
    selectedDiagramConnection = null;

    closeNodeContextMenu();
    closeMeasureContextMenu();

    // Recalculate all dimensions after restoring.
    measuredBoxHeightsById = {};
    measuredItemHeightsById = {};
    suppressAutosizeRelayout = false;

    resetColorEditorForm();
    setAppearanceInputsFromConfig();
    updateAllViews();

    diagramHistoryIndex = index;

  } finally {
    diagramHistoryRestoring = false;
    refreshDiagramHistoryButtons();
  }
}

function undoDiagramChange() {
  if (diagramHistoryIndex > 0) {
    restoreDiagramHistory(diagramHistoryIndex - 1);
  }
}

function redoDiagramChange() {
  if (diagramHistoryIndex < diagramHistoryStates.length - 1) {
    restoreDiagramHistory(diagramHistoryIndex + 1);
  }
}




function updateAllViews() {
  // B3.1: Record changes, but ignore unchanged redraws.
  recordDiagramHistory();

  refreshParentOptions();

  if (diagramViewMode === "outline") {
    renderDiagramOutline();
  } else {
    renderDiagram();
  }

  refreshColorSelect();
  renderColorOptionsList();
  renderLegend();
  updateLegendVisibility();
  updateDiagramSelectionBar();
  updateDiagramConnectionBar();

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


/* B2.2 — Direct measure selection */

var selectedDiagramMeasure = null;
var measureContextMenuEl = null;

function updateMeasureSelectionVisuals() {
  document.querySelectorAll(".diagram-measure-row").forEach(function (row) {
    var selected = !!selectedDiagramMeasure &&
      row.dataset.nodeId === selectedDiagramMeasure.nodeId &&
      Number(row.dataset.measureIndex) === selectedDiagramMeasure.index;

    row.classList.toggle("diagram-measure-selected", selected);
    row.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

function clearSelectedDiagramMeasure() {
  selectedDiagramMeasure = null;
  updateMeasureSelectionVisuals();
}

function selectDiagramMeasure(nodeId, index, toggle) {
  // Do not interrupt unfinished driver text editing.
  if (activeDiagramTextEdit) return;

  var node = nodes.find(function (n) {
    return n.id === nodeId;
  });

  if (!node || !Array.isArray(node.measures) || !node.measures[index]) {
    return;
  }

  clearDiagramConnectionSelection();

  var isSame = selectedDiagramMeasure &&
    selectedDiagramMeasure.nodeId === nodeId &&
    selectedDiagramMeasure.index === index;

  selectedDiagramMeasure = (toggle && isSame)
    ? null
    : { nodeId: nodeId, index: index };

  // Only one driver or measure may be selected.
  selectedDiagramNodeId = null;

  document.querySelectorAll(".diagram-node.diagram-selected")
    .forEach(function (box) {
      box.classList.remove("diagram-selected");
    });

  updateDiagramSelectionBar();
  updateMeasureSelectionVisuals();
}

function closeMeasureContextMenu() {
  if (measureContextMenuEl) {
    measureContextMenuEl.remove();
    measureContextMenuEl = null;
  }
}

function openMeasureContextMenu(nodeId, index, x, y) {
  closeNodeContextMenu();
  closeMeasureContextMenu();

  var menu = document.createElement("div");
  menu.className = "diagram-measure-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Measure actions");

  function addAction(label, action) {
    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = label;

    button.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeMeasureContextMenu();
      action();
    });

    menu.appendChild(button);
  }

  addAction("Edit measure…", function () {
    editMeasureOnNode(nodeId, index);
  });

  addAction("Delete measure…", function () {
    deleteMeasureOnNode(nodeId, index);
  });

  document.body.appendChild(menu);
  measureContextMenuEl = menu;

  // Keep the small menu within the visible browser window.
  var bounds = menu.getBoundingClientRect();

  menu.style.left = Math.max(
    8, Math.min(x, window.innerWidth - bounds.width - 8)
  ) + "px";

  menu.style.top = Math.max(
    8, Math.min(y, window.innerHeight - bounds.height - 8)
  ) + "px";

  menu.querySelector("button").focus();
}


function selectDiagramNode(nodeId) {
  // Do not change selection while editing text.
  if (activeDiagramTextEdit) {
    var feedback = document.getElementById("diagramEditFeedback");
    if (feedback) {
      feedback.textContent = "Save or cancel the current edit first.";
    }
    return;
  }


// B2.2: Selecting a driver clears measure selection.
clearSelectedDiagramMeasure();
closeMeasureContextMenu();
clearDiagramConnectionSelection();

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
bar.hidden = true;

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

clearSelectedDiagramMeasure();
closeMeasureContextMenu();
clearDiagramConnectionSelection();

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
    var feedback =
      document.getElementById("diagramInlineTextFeedback") ||
      document.getElementById("diagramEditFeedback");

    if (feedback) {
      feedback.textContent = "Text cannot be empty.";
    }

    if (input) input.focus();    return;
  }

  var node = nodes.find(function (n) {
    return n.id === id;
  });


  if (node) {
    node.text = nextText;

    // Apply the colour selected during inline editing.
    if (Object.prototype.hasOwnProperty.call(
      activeDiagramTextEdit, "pendingColour"
    )) {
      node.color = activeDiagramTextEdit.pendingColour;

      // Commit a newly named colour to the shared palette.
      var option = activeDiagramTextEdit.pendingColourOption;

      if (option && !findColorOptionByValue(option.value)) {
        colorOptions.push(option);
      }
    }
  }

  dismissInlineColourMenu();
  activeDiagramTextEdit = null;

  // Recalculate the box height after editing.
  delete measuredBoxHeightsById[id];
  delete measuredItemHeightsById[id];

  updateAllViews();
}


function cancelDiagramInlineText() {
  if (!activeDiagramTextEdit) return;
  dismissInlineColourMenu();

  var editing = activeDiagramTextEdit;
  activeDiagramTextEdit = null;

  if (editing.isNew) {
    // Discard the unfinished box.
    nodes = nodes.filter(function (n) {
      return n.id !== editing.id;
    });

    // Remove its automatic connection.
    connections = connections.filter(function (c) {
      return c.fromId !== editing.id &&
             c.toId !== editing.id;
    });

    // Restore the identifier counter.
    nextId = editing.previousNextId;

    // Return selection to the parent box.
    selectedDiagramNodeId = editing.parentId;

    delete measuredBoxHeightsById[editing.id];
    delete measuredItemHeightsById[editing.id];
  }

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

    connections = connections.filter(function (c) {
      return c.toId !== nodeId ||
        selectedIds.indexOf(c.fromId) !== -1;
    });

    selectedIds.forEach(function (parentId) {
      var exists = connections.some(function (c) {
        return c.fromId === parentId && c.toId === nodeId;
      });

      if (!exists) {
        connections.push({
          fromId: parentId,
          toId: nodeId
        });
      }
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
  // Finish an existing edit before starting another box.
  if (activeDiagramTextEdit) return;
  if (document.querySelector(
    "dialog[open], .diagram-measure-editor-overlay"
  )) return;

  var refNode = nodes.find(function (n) {
    return n.id === nodeId;
  });
  if (!refNode) return;

  var nextLevel = getNextLevel(refNode.level);
  if (!nextLevel) return;

  var previousNextId = nextId;

  var newNode = createNode({
    level: nextLevel,
    text: "",
    parentId: refNode.id,
    color: refNode.color
  });

  insertAfterLastSibling(nodes, newNode);

  // Automatically connect the new box to its parent.
  connections.push({
    fromId: refNode.id,
    toId: newNode.id
  });

  clearSelectedDiagramMeasure();
  closeMeasureContextMenu();
  clearDiagramConnectionSelection();

  selectedDiagramNodeId = newNode.id;

  // Mark the new box as an unfinished draft.
  activeDiagramTextEdit = {
    id: newNode.id,
    parentId: refNode.id,
    previousNextId: previousNextId,
    draft: "",
    isNew: true
  };

  // Display it immediately without adding Undo history.
  renderDiagram();
  updateDiagramSelectionBar();

  function focusNewEditor() {
    if (!activeDiagramTextEdit ||
        activeDiagramTextEdit.id !== newNode.id) return;

    var input = document.getElementById(
      "diagramInlineText"
    );

    if (input) input.focus();
  }

  focusNewEditor();

  // Auto-sizing may cause one additional render.
  // Return focus to the new text field afterwards.
  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(focusNewEditor);
    });
  }
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
      var saved = {
        fromId: (c.fromId || "").toString(),
        toId: (c.toId || "").toString()
      };

      var style = normaliseConnectionOverride(c.style);

      if (style) {
        saved.style = style;
      }

      return saved;
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
      fontBold: !!diagramAppearance.fontBold,
connectionStyle: normaliseConnectionStyle(
  diagramAppearance.connectionStyle
)
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


// B2.5: Restore the saved connection style.
// Older project files automatically use Bézier.
diagramAppearance.connectionStyle =
  normaliseConnectionStyle(
    project.diagramAppearance &&
    project.diagramAppearance.connectionStyle
  );


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
              toId: (c.toId || "").toString(),
              style: normaliseConnectionOverride(c.style)
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
  if (activeOutlineTextEdit) {
    alert(
      "Save or cancel the Outline text edit before saving."
    );
    return;
  }
  if (activeDiagramTextEdit &&
      activeDiagramTextEdit.isNew) {
    alert("Save or cancel the new box before saving your diagram.");
    return;
  }

  if (!nodes.length) {    alert("There is no driver diagram to save.");
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


// B1.4: Embed the external CSS in saved HTML files.
// This keeps saved diagrams visually self-contained.

var liveStylesheet = document.querySelector(
  'link[rel="stylesheet"][href="./styles.css"]'
);

var clonedStylesheet = htmlClone.querySelector(
  'link[rel="stylesheet"][href="./styles.css"]'
);

if (!liveStylesheet ||
    !liveStylesheet.sheet ||
    !clonedStylesheet) {
  throw new Error(
    "Could not locate the loaded styles.css stylesheet."
  );
}

var embeddedCss;

try {
  embeddedCss = Array.from(
    liveStylesheet.sheet.cssRules
  ).map(function (rule) {
    return rule.cssText;
  }).join("\n");
} catch (error) {
  throw new Error(
    "Could not embed styles.css: " + error.message
  );
}

if (!embeddedCss.trim()) {
  throw new Error("styles.css contained no readable rules.");
}

var embeddedStyleElement = document.createElement("style");
embeddedStyleElement.textContent = embeddedCss;

// Replace the external reference with the actual CSS.
clonedStylesheet.replaceWith(embeddedStyleElement);


      /*
        Remove temporary menus created while using the tool.
      */
      htmlClone
        .querySelectorAll(
          "#nodeContextMenu, .node-context-submenu, " +
"#quickColourDialog, .diagram-measure-context-menu, " +
".diagram-quick-add-measure, .diagram-connection-hit " 
        )
        
        .forEach(function (element) {
          element.remove();
        });

      htmlClone.querySelectorAll(
        ".diagram-connection-visible"
      ).forEach(function (element) {
        element.setAttribute("stroke", "#666");
        element.setAttribute("stroke-width", "2.5");
        element.removeAttribute("data-selected");
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

            // Ensure the AI guidance window is closed in saved HTML.
      var aiDialogInCopy =
        htmlClone.querySelector("#aiGuidanceDialog");

      if (aiDialogInCopy) {
        aiDialogInCopy.removeAttribute("open");
      }

      // A portable diagram must never save a user's edited AI prompt.
      var promptInCopy = htmlClone.querySelector("#aiPromptEditor");
      if (promptInCopy) {
        promptInCopy.value = "";
        promptInCopy.defaultValue = "";
        promptInCopy.textContent = "";
      }
      var promptStatusInCopy = htmlClone.querySelector("#aiPromptStatus");
      if (promptStatusInCopy) promptStatusInCopy.textContent = "";

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
        "The application could not embed its JavaScript or stylesheet. " +
	"Try saving from the hosted development website.\n\n" +
        "Technical detail: " +
        error.message
      );
    });
}


/* ---------- CSV import / export ---------- */

function downloadCsv() {
  if (activeOutlineTextEdit) {
    alert(
      "Save or cancel the Outline text edit before saving."
    );
    return;
  }
  if (activeDiagramTextEdit &&
      activeDiagramTextEdit.isNew) {
    alert("Save or cancel the new box before downloading a CSV backup.");
    return;
  }

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
connection_style: normaliseConnectionStyle(
  diagramAppearance.connectionStyle
),
	title_aim: columnTitles.aim,
	title_primary: columnTitles.primary,
	title_secondary: columnTitles.secondary,
	title_change: columnTitles.change,
	palette_json: JSON.stringify(colorOptions || []),

        measures_json: JSON.stringify(n.measures || []),

        connection_styles_json: JSON.stringify(
          connections.filter(function (c) {
            return c.toId === n.id &&
              normaliseConnectionOverride(c.style);
          }).map(function (c) {
            return {
              fromId: c.fromId,
              style: normaliseConnectionOverride(c.style)
            };
          })
        )


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


/* B4.1d.1 — Validate CSV before replacing the current diagram. */

function validateDiagramCsvBeforeImport(results) {
  var errors = [];

  var rows = results && Array.isArray(results.data)
    ? results.data : [];

  var fields = results && results.meta &&
    Array.isArray(results.meta.fields)
      ? results.meta.fields
      : (rows[0] ? Object.keys(rows[0]) : []);

  // Do not ignore errors reported by the CSV parser.
  if (results && results.errors && results.errors.length) {
    errors.push(
      "The CSV contains parsing errors (check its quoting and columns)."
    );
  }

  // These columns are required for a valid driver diagram.
  ["id", "level", "text", "parent_id"].forEach(function (field) {
    if (fields.indexOf(field) === -1) {
      errors.push("Missing required column: " + field + ".");
    }
  });

  if (!rows.length) {
    errors.push("The CSV contains no diagram elements.");
  }

  var identifiers = Object.create(null);
  var references = [];
  var aimCount = 0;

  rows.forEach(function (row, index) {
    var line = index + 2; // Row 1 contains the headers.

    if (!row || typeof row !== "object" ||
        Array.isArray(row)) {
      errors.push("Row " + line + ": not a valid record.");
      return;
    }

    var id = String(
      row.id == null ? "" : row.id
    ).trim();

    var level = String(
      row.level == null ? "" : row.level
    ).trim();

    var nodeText = String(
      row.text == null ? "" : row.text
    ).trim();

    var parent = String(
      row.parent_id == null ? "" : row.parent_id
    ).trim();

    // Check element identifiers.
    if (!id) {
      errors.push("Row " + line + ": missing element ID.");
    } else if (identifiers[id]) {
      errors.push(
        "Row " + line + ": duplicate element ID " + id + "."
      );
    } else {
      identifiers[id] = true;
    }

    // Check diagram levels.
    if (["aim", "primary", "secondary", "change"]
        .indexOf(level) === -1) {
      errors.push(
        "Row " + line + ": unrecognised level " +
        (level || "(blank)") + "."
      );
    }

    if (level === "aim") aimCount++;

    if (!nodeText) {
      errors.push("Row " + line + ": missing element text.");
    }

    // Collect parent references to verify afterwards.
    if (parent) {
      references.push({ line: line, id: parent });
    }

    var extra = String(
      row.extra_parents == null ? "" : row.extra_parents
    ).trim();

    if (extra) {
      extra.split(/[;,]/).forEach(function (value) {
        value = value.trim();
        if (value) {
          references.push({ line: line, id: value });
        }
      });
    }

    // Check optional structured fields.
    // Older CSVs may not include these columns.
    [
      "measures_json",
      "palette_json",
      "connection_styles_json"
    ].forEach(function (field) {

      var raw = String(
        row[field] == null ? "" : row[field]
      ).trim();

      if (!raw) return;

      try {
        var value = JSON.parse(raw);

        if (!Array.isArray(value)) {
          errors.push(
            "Row " + line + ": " + field +
            " must contain a list."
          );
        }
      } catch (error) {
        errors.push(
          "Row " + line + ": invalid JSON in " +
          field + "."
        );
      }
    });
  });

  if (rows.length && !aimCount) {
    errors.push(
      "The CSV does not contain an Aim element."
    );
  }

  // Confirm that all referenced parents actually exist.
  references.forEach(function (reference) {
    if (!identifiers[reference.id]) {
      errors.push(
        "Row " + reference.line +
        ": parent ID " + reference.id +
        " does not exist in this CSV."
      );
    }
  });


  // B4.1d.2a — Detect self-parenting and circular connections.
  var nodeIds = Object.keys(identifiers);
  var incomingCount = Object.create(null);
  var childrenByParent = Object.create(null);
  var seenLinks = Object.create(null);

  nodeIds.forEach(function (id) {
    incomingCount[id] = 0;
    childrenByParent[id] = [];
  });

  rows.forEach(function (row, index) {
    if (!row || typeof row !== "object" ||
        Array.isArray(row)) return;

    var childId = String(
      row.id == null ? "" : row.id
    ).trim();

    if (!identifiers[childId]) return;

    var mainParent = String(
      row.parent_id == null ? "" : row.parent_id
    ).trim();

    var extraParents = String(
      row.extra_parents == null ? "" : row.extra_parents
    ).split(/[;,]/).map(function (value) {
      return value.trim();
    }).filter(Boolean);

    var parents = (mainParent ? [mainParent] : [])
      .concat(extraParents);

    parents.forEach(function (parentId) {
      // Missing parents were already reported above.
      if (!identifiers[parentId]) return;

      if (parentId === childId) {
        errors.push(
          "Row " + (index + 2) + ": element " +
          childId + " cannot be its own parent."
        );
        return;
      }

      // Ignore duplicate links when building the graph.
      var linkKey = JSON.stringify([parentId, childId]);
      if (seenLinks[linkKey]) return;

      seenLinks[linkKey] = true;
      childrenByParent[parentId].push(childId);
      incomingCount[childId]++;
    });
  });

  // Process elements with no incoming parent connections.
  // Any unprocessed elements indicate a circular relationship.
  var queue = nodeIds.filter(function (id) {
    return incomingCount[id] === 0;
  });

  var processed = 0;

  for (var i = 0; i < queue.length; i++) {
    var id = queue[i];
    processed++;

    childrenByParent[id].forEach(function (childId) {
      incomingCount[childId]--;

      if (incomingCount[childId] === 0) {
        queue.push(childId);
      }
    });
  }

  if (processed !== nodeIds.length) {
    errors.push(
      "The CSV contains a circular connection between elements."
    );
  }


  // Check the contents of optional JSON fields as well.
  validateDiagramCsvStructuredFields(rows, errors);

  return errors;
}

/* B4.1d.2b — Validate structured CSV field contents. */

function validateDiagramCsvStructuredFields(rows, errors) {
  rows.forEach(function (row, index) {
    if (!row || typeof row !== "object" ||
        Array.isArray(row)) return;

    var rowNumber = index + 2;

    function getArray(field) {
      var raw = row[field];

      // Optional columns are absent in older CSV files.
      if (raw == null || String(raw).trim() === "") {
        return null;
      }

      try {
        var value = JSON.parse(String(raw));
        return Array.isArray(value) ? value : null;
      } catch (e) {
        // The existing validator already reports invalid JSON.
        return null;
      }
    }

    // Validate individual measures.
    var measures = getArray("measures_json");

    if (measures) {
      measures.forEach(function (measure, i) {
        var where = "Row " + rowNumber +
          ": measures_json entry " + (i + 1);

        if (!measure || typeof measure !== "object" ||
            Array.isArray(measure)) {
          errors.push(where + " must be a measure object.");
          return;
        }

        if (typeof measure.text !== "string" ||
            !measure.text.trim()) {
          errors.push(where + " needs non-empty text.");
        }

        // Missing type is allowed for older files.
        var type = measure.type;

        if (type != null && type !== "" &&
            (typeof type !== "string" ||
            ["outcome", "process", "balancing", "none"]
              .indexOf(type.trim().toLowerCase()) === -1)) {
          errors.push(where + " has an invalid measure type.");
        }
      });
    }

    // Validate named colours in the shared palette.
    var palette = getArray("palette_json");

    if (palette) {
      palette.forEach(function (option, i) {
        var where = "Row " + rowNumber +
          ": palette_json entry " + (i + 1);

        if (!option || typeof option !== "object" ||
            Array.isArray(option)) {
          errors.push(where + " must be a colour object.");
          return;
        }

        if (typeof option.label !== "string" ||
            !option.label.trim()) {
          errors.push(where + " needs a colour name.");
        }

        if (typeof option.value !== "string" ||
            !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(
              option.value.trim())) {
          errors.push(where + " needs a valid hex colour.");
        }
      });
    }

    // Validate individual connection styles.
    var styles = getArray("connection_styles_json");

    if (styles) {
      var mainParent = String(
        row.parent_id == null ? "" : row.parent_id
      ).trim();

      var allowedParents =
        (mainParent ? [mainParent] : []).concat(
          String(
            row.extra_parents == null
              ? "" : row.extra_parents
          ).split(/[;,]/).map(function (id) {
            return id.trim();
          }).filter(Boolean)
        );

      styles.forEach(function (entry, i) {
        var where = "Row " + rowNumber +
          ": connection_styles_json entry " + (i + 1);

        if (!entry || typeof entry !== "object" ||
            Array.isArray(entry)) {
          errors.push(where + " must be a connection object.");
          return;
        }

        var fromId = String(
          entry.fromId == null ? "" : entry.fromId
        ).trim();

        if (!fromId ||
            allowedParents.indexOf(fromId) === -1) {
          errors.push(
            where +
            " references a parent not listed for this element."
          );
        }

        if (["straight", "orthogonal", "bezier"]
            .indexOf(entry.style) === -1) {
          errors.push(where + " has an invalid line style.");
        }
      });
    }
  });
}

function uploadCsv(file) {
  if (activeOutlineTextEdit) {
    alert(
      "Save or cancel the Outline text edit before opening another CSV."
    );
    return;
  }



  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {

      // B4.1d.1: Reject invalid files before changing data.
      var errors = validateDiagramCsvBeforeImport(results);

      if (errors.length) {
        alert(
          "CSV import cancelled. Your current diagram has not changed.\n\n" +
          errors.slice(0, 8).join("\n") +
          (errors.length > 8
            ? "\n...and " + (errors.length - 8) + " more issue(s)."
            : "")
        );

        return;
      }

      var rows = results.data || [];

      var imported = [];
      var extraConnectionsRaw = []; // { childId, parents[] }
      var connectionStylesRaw = [];
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
          // Missing or blank means auto-size on; explicit 0 means off.
          autoSize: (row.auto_size == null ||
            String(row.auto_size).trim() === "" ||
            String(row.auto_size).trim() === "1"),

          measures: measures
        });

        var stylesJson = (
          row.connection_styles_json || ""
        ).toString().trim();

        if (stylesJson) {
          try {
            var parsedStyles = JSON.parse(stylesJson);

            if (Array.isArray(parsedStyles)) {
              connectionStylesRaw.push({
                childId: id,
                entries: parsedStyles
              });
            }
          } catch (error) {
            console.warn(
              "Invalid connection_styles_json on CSV row " +
              (index + 1),
              error
            );
          }
        }

        // Parse extra parentsinto an array of IDs
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
var connectionStyleFromCsv =
  (row.connection_style || "").toString().trim();

          var hasAny =
            (row.box_height && !isNaN(bh)) ||
            (row.vertical_gap && !isNaN(vg)) ||
            (row.font_size && !isNaN(fs)) ||
            ff ||
fbRaw ||
connectionStyleFromCsv;

          if (hasAny) {
            appearanceFromCsv = {
              boxHeight: isFinite(bh) && bh > 0 ? bh : diagramAppearance.boxHeight,
              verticalGap: isFinite(vg) && vg >= 0 ? vg : diagramAppearance.verticalGap,
              fontSize: isFinite(fs) && fs > 0 ? fs : diagramAppearance.fontSize,
              fontFamily: ff,
              fontBold: fb,
connectionStyle: normaliseConnectionStyle(
  connectionStyleFromCsv
)
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


// Restore optional per-connection styles after
// all connections have been rebuilt.

connectionStylesRaw.forEach(function (entry) {
  entry.entries.forEach(function (item) {
    if (!item || typeof item !== "object") return;

    var fromId = (item.fromId || "").toString();
    var style = normaliseConnectionOverride(item.style);

    if (!fromId || !style) return;

    var link = connections.find(function (c) {
      return c.fromId === fromId &&
        c.toId === entry.childId;
    });

    if (link) {
      link.style = style;
    }
  });
});

// Restore the CSV style; use Bézier for older files.

diagramAppearance.connectionStyle =
  normaliseConnectionStyle(
    appearanceFromCsv && appearanceFromCsv.connectionStyle
  );

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
    },

    error: function (error) {
      alert(
        "CSV could not be read. Your current diagram has not changed.\n\n" +
        (error && error.message
          ? error.message
          : "Please check the selected file.")
      );
    }
  });
}


/* B4.4a.1 — Read-only Outline view (same diagram data). */


var diagramViewMode = "diagram";
var diagramOutlineOpenById = Object.create(null);


/* B4.4c — Track an unfinished Outline text edit. */
var activeOutlineTextEdit = null;

/* B4.4d.1 — Add a child from Outline without creating a draft node. */

function beginOutlineChildEdit(parentId) {
  if (diagramViewMode !== "outline" || activeDiagramTextEdit) return;

  if (activeOutlineTextEdit) {
    alert("Save or cancel the current Outline edit first.");

    var existingInput =
      document.getElementById("diagramOutlineEditInput");

    if (existingInput) existingInput.focus();
    return;
  }

  var parent = nodes.find(function (node) {
    return String(node.id) === String(parentId);
  });

  if (!parent) return;

  var childLevel = getNextLevel(parent.level);
  if (!childLevel) return;

  activeOutlineTextEdit = {
    isNew: true,
    parentId: String(parent.id),
    level: childLevel,
    draft: ""
  };

  diagramOutlineOpenById[String(parent.id)] = true;
  renderDiagramOutline();

  var input = document.getElementById("diagramOutlineEditInput");
  if (input) input.focus();
}

function finishOutlineChildEdit(save) {
  var editing = activeOutlineTextEdit;
  if (!editing || !editing.isNew) return;

  var input = document.getElementById("diagramOutlineEditInput");
  var text = String(input ? input.value : editing.draft).trim();
  var error = document.getElementById("diagramOutlineEditError");

  if (save && !text) {
    if (error) error.textContent = "Text cannot be empty.";
    if (input) input.focus();
    return;
  }

  var parent = nodes.find(function (node) {
    return String(node.id) === editing.parentId;
  });

  if (save && (!parent || getNextLevel(parent.level) !== editing.level)) {
    if (error) error.textContent = "The parent is no longer available.";
    return;
  }

  activeOutlineTextEdit = null;
  var newNode = null;

  if (save) {
    newNode = createNode({
      level: editing.level,
      text: text,
      parentId: parent.id,
      color: parent.color || ""
    });

    insertAfterLastSibling(nodes, newNode);

    connections.push({
      fromId: parent.id,
      toId: newNode.id
    });

    diagramOutlineOpenById[String(parent.id)] = true;

    // One completed addition creates one Undo entry.
    updateAllViews();

  } else {
    // Cancel leaves nodes, connections, IDs and history unchanged.
    renderDiagramOutline();
  }

  // Keep keyboard focus near the same element.
  var selector = save
    ? ".diagram-outline-edit-button"
    : ".diagram-outline-add-button";

  var targetId = save ? String(newNode.id) : editing.parentId;
  var attribute = save ? "outlineNodeId" : "outlineParentId";

  Array.from(
    document.querySelectorAll("#diagramOutlineTree " + selector)
  ).some(function (button) {
    if (button.dataset[attribute] !== targetId) return false;
    button.focus();
    return true;
  });
}

function beginOutlineTextEdit(nodeId) {

  var id = String(nodeId);

  if (activeDiagramTextEdit) return;

  if (activeOutlineTextEdit) {
    if (activeOutlineTextEdit.id !== id) {
      alert("Save or cancel the current Outline edit first.");
    }

    var currentInput =
      document.getElementById("diagramOutlineEditInput");

    if (currentInput) currentInput.focus();
    return;
  }

  var node = nodes.find(function (item) {
    return String(item.id) === id;
  });

  if (!node) return;

  activeOutlineTextEdit = {
    id: id,
    draft: node.text || ""
  };

  renderDiagramOutline();

  var input =
    document.getElementById("diagramOutlineEditInput");

  if (input) {
    input.focus();
    input.select();
  }
}

function finishOutlineTextEdit(save) {
  if (!activeOutlineTextEdit) return;

  // New children have no ID until their text is confirmed.
  if (activeOutlineTextEdit.isNew) {
    finishOutlineChildEdit(save);
    return;
  }

  var id = activeOutlineTextEdit.id;  var input =
    document.getElementById("diagramOutlineEditInput");

  var nextText = String(
    input ? input.value : activeOutlineTextEdit.draft
  ).trim();

  if (save && !nextText) {
    var error =
      document.getElementById("diagramOutlineEditError");

    if (error) {
      error.textContent = "Text cannot be empty.";
    }

    if (input) input.focus();
    return;
  }

  var node = nodes.find(function (item) {
    return String(item.id) === id;
  });

  var changed = !!(
    save && node && nextText !== node.text
  );

  activeOutlineTextEdit = null;

  if (changed) {
    node.text = nextText;

    // Recalculate heights when Diagram view is next shown.
    delete measuredBoxHeightsById[id];
    delete measuredItemHeightsById[id];

    // Updates both the Outline and one Undo history entry.
    updateAllViews();
  } else {
    // Cancel, or unchanged text: no history entry.
    renderDiagramOutline();
  }

  // Restore keyboard focus to the same Edit button.
  var buttons = document.querySelectorAll(
    "#diagramOutlineTree .diagram-outline-edit-button"
  );

  Array.from(buttons).some(function (button) {
    if (button.dataset.outlineNodeId === id) {
      button.focus();
      return true;
    }
    return false;
  });
}

function buildOutlineTextEditor(node) {
  var editor = document.createElement("div");
  editor.className = "diagram-outline-editor";

  var label = document.createElement("label");
  label.htmlFor = "diagramOutlineEditInput";
  label.textContent =
    (activeOutlineTextEdit.isNew ? "Add " : "Edit ") +
    getLevelLabel(node.level) + " text";

  editor.appendChild(label);

  var input = document.createElement("textarea");
  input.id = "diagramOutlineEditInput";
  input.rows = 3;
  input.value = activeOutlineTextEdit.draft;

  input.addEventListener("input", function () {
    if (activeOutlineTextEdit) {
      activeOutlineTextEdit.draft = input.value;
    }

    var error =
      document.getElementById("diagramOutlineEditError");

    if (error) error.textContent = "";
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finishOutlineTextEdit(false);

    } else if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault();
      event.stopPropagation();
      finishOutlineTextEdit(true);
    }
  });

  editor.appendChild(input);

  var feedback = document.createElement("p");
  feedback.id = "diagramOutlineEditError";
  feedback.setAttribute("role", "alert");
  editor.appendChild(feedback);

  var actions = document.createElement("div");
  actions.className = "diagram-outline-editor-actions";

  var cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.className = "secondary";

  cancel.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    finishOutlineTextEdit(false);
  });

  var confirm = document.createElement("button");
  confirm.type = "button";
  confirm.textContent = "Save";

  confirm.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    finishOutlineTextEdit(true);
  });

  actions.appendChild(cancel);
  actions.appendChild(confirm);
  editor.appendChild(actions);

  return editor;
}


/* B4.4d.2–4 — Reuse existing editors from a compact Outline Actions menu. */

function outlineActionCanStart() {
  if (
    activeDiagramTextEdit ||
    activeOutlineTextEdit ||
    document.querySelector(
      "dialog[open], .diagram-measure-editor-overlay"
    )
  ) {
    alert("Save or cancel the current edit first.");
    return false;
  }
  return true;
}

function buildOutlineActionControls(node) {
  var group = document.createElement("span");
  group.className = "diagram-outline-action-group";

  var trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "diagram-outline-edit-button";
  trigger.textContent = "Actions ▾";
  trigger.setAttribute("aria-label", "Actions for " + node.text);
  trigger.setAttribute("aria-expanded", "false");

  var menu = document.createElement("span");
  menu.className = "diagram-outline-action-menu";
  menu.hidden = true;

  function closeMenu() {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    if (!outlineActionCanStart()) return;

    var opening = menu.hidden;

    document.querySelectorAll(
      "#diagramOutlineTree .diagram-outline-action-menu"
    ).forEach(function (other) {
      other.hidden = true;
    });

    document.querySelectorAll(
      "#diagramOutlineTree .diagram-outline-action-group > button"
    ).forEach(function (button) {
      button.setAttribute("aria-expanded", "false");
    });

    menu.hidden = !opening;
    trigger.setAttribute("aria-expanded", opening ? "true" : "false");
  });

  // Don't expand/collapse the enclosing Outline branch.
  group.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  group.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      trigger.focus();
    }
  });

  group.addEventListener("focusout", function (event) {
    if (!group.contains(event.relatedTarget)) closeMenu();
  });

  function actionButton(text, action, className) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    if (className) button.className = className;

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!outlineActionCanStart()) return;
      closeMenu();
      action();
    });

    menu.appendChild(button);
  }


  // B4.4d.5 — Only show movement options when applicable.
  var siblings = getSiblingIdsInOrder(node);
  var siblingPosition = siblings.indexOf(node.id);

  if (siblingPosition > 0) {
    actionButton("Move up", function () {
      moveOutlineSibling(node.id, "up");
    });
  }

  if (
    siblingPosition >= 0 &&
    siblingPosition < siblings.length - 1
  ) {
    actionButton("Move down", function () {
      moveOutlineSibling(node.id, "down");
    });
  }

  actionButton("+ Add measure", function () {
    addMeasureToNode(node.id);
  });


  var colourLabel = document.createElement("label");
  colourLabel.className = "diagram-outline-colour-label";
  colourLabel.textContent = "Box colour";

  var colourSelect = document.createElement("select");
  colourSelect.setAttribute("aria-label", "Colour for " + node.text);

  function option(name, value) {
    var item = document.createElement("option");
    item.value = value;
    item.textContent = name;
    colourSelect.appendChild(item);
  }

  option("No colour", "");
  colorOptions.forEach(function (colour) {
    option(colour.label, colour.value);
  });

  if (node.color && !colorOptions.some(function (colour) {
    return colour.value === node.color;
  })) {
    option("Current colour (" + node.color + ")", node.color);
  }

  option("+ Create a named colour…", "__outline_new_colour__");
  colourSelect.value = node.color || "";

  colourSelect.addEventListener("change", function (event) {
    event.stopPropagation();
    if (!outlineActionCanStart()) {
      colourSelect.value = node.color || "";
      return;
    }

    var chosen = colourSelect.value;
    closeMenu();

    if (chosen === "__outline_new_colour__") {
      colourSelect.value = node.color || "";
      openQuickColourDialogForNode(node.id);
      return;
    }

    if (chosen !== (node.color || "")) {
      node.color = chosen;
      updateAllViews();
    }
  });

  colourLabel.appendChild(colourSelect);
  menu.appendChild(colourLabel);

  actionButton("Delete element…", function () {
    // Existing confirmation also describes dependent elements.
    deleteNode(node.id);
  }, "diagram-outline-delete-action");

  group.appendChild(trigger);
  group.appendChild(menu);
  return group;
}


/* B4.4d.5 — Reorder Outline siblings using the existing helper. */

function moveOutlineSibling(nodeId, direction) {
  if (diagramViewMode !== "outline" || !outlineActionCanStart()) {
    return false;
  }

  var node = nodes.find(function (n) {
    return String(n.id) === String(nodeId);
  });

  if (!node || (direction !== "up" && direction !== "down")) {
    return false;
  }

  var siblings = getSiblingIdsInOrder(node);
  var index = siblings.indexOf(node.id);

  if (
    index < 0 ||
    (direction === "up" && index === 0) ||
    (direction === "down" && index === siblings.length - 1)
  ) {
    return false;
  }

  // Existing helper protects parent groups and creates one Undo step.
  moveNodeWithinSiblings(node.id, direction);

  // Announce the move to assistive technology.
  var status = document.getElementById("diagramOutlineStatus");

  if (status) {
    status.textContent =
      "Moved " + node.text + " " + direction +
      " within its parent group.";
  }

  // Restore keyboard focus after the Outline redraw.
  var editButtons = document.querySelectorAll(
    '#diagramOutlineTree .diagram-outline-edit-button' +
    '[data-outline-node-id]'
  );

  Array.from(editButtons).some(function (button) {
    if (button.dataset.outlineNodeId !== String(node.id)) {
      return false;
    }

    var trigger = button.parentElement.querySelector(
      ".diagram-outline-action-group > button"
    );

    if (trigger) trigger.focus();

    return !!trigger;
  });

  return true;
}

function renderDiagramOutline() {


  var host = document.getElementById("diagramOutlineTree");
  if (!host) return;

  host.replaceChildren();

  var lookup = Object.create(null);
  var children = Object.create(null);
  var visited = Object.create(null);

  nodes.forEach(function (node) {
    lookup[String(node.id)] = node;
    children[String(node.id)] = [];
  });

  nodes.forEach(function (node) {
    var parentId = String(node.parentId || "");

    if (
      parentId &&
      lookup[parentId] &&
      parentId !== String(node.id)
    ) {
      children[parentId].push(node);
    }
  });

  function addNode(node, list) {
    var id = String(node.id);
    if (visited[id]) return;
    visited[id] = true;

    var li = document.createElement("li");
    var row = document.createElement("span");
    row.className = "diagram-outline-row";

    var tag = document.createElement("span");
    tag.className =
      "diagram-outline-type diagram-outline-" + node.level;

    tag.textContent = ({
      aim: "Aim",
      primary: "Primary",
      secondary: "Secondary",
      change: "Change idea"
    })[node.level] || node.level;

    row.appendChild(tag);

    if (node.color) {
      var swatch = document.createElement("span");
      swatch.className = "diagram-outline-swatch";
      swatch.style.backgroundColor = node.color;
      swatch.setAttribute(
        "aria-label", "Element colour " + node.color
      );
      row.appendChild(swatch);
    }

    // B4.4b: Click the text to find this element in Diagram view.
    var label = document.createElement("button");
    label.type = "button";
    label.className =
      "diagram-outline-text diagram-outline-locate";

    label.textContent = node.text || "(Untitled element)";
    label.title = "Find this element in the diagram";

    label.setAttribute(
      "aria-label",
      "Find in diagram: " + label.textContent
    );

    label.addEventListener("click", function (event) {
      // Prevent the parent <summary> from expanding or collapsing.
      event.preventDefault();
      event.stopPropagation();

      locateDiagramNodeFromOutline(node.id);
    });

    row.appendChild(label);

    // B4.4c — Edit the text without leaving Outline view.
    var editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "diagram-outline-edit-button";
    editButton.textContent = "Edit";
    editButton.dataset.outlineNodeId = id;

    editButton.setAttribute(
      "aria-label",
      "Edit text: " + label.textContent
    );

    editButton.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      beginOutlineTextEdit(id);
    });


    row.appendChild(editButton);

    // B4.4d.1 — Only the first three levels can have children.
    var nextLevel = getNextLevel(node.level);

    if (nextLevel) {
      var addButton = document.createElement("button");
      addButton.type = "button";

      // Reuse the existing Edit button's compact styling.
      addButton.className =
        "diagram-outline-edit-button diagram-outline-add-button";

      addButton.textContent = "+ Add child";
      addButton.dataset.outlineParentId = id;
      addButton.title = "Add " + getLevelLabel(nextLevel);

      addButton.setAttribute(
        "aria-label",
        "Add " + getLevelLabel(nextLevel) + " under " + node.text
      );

      addButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        beginOutlineChildEdit(id);
      });

      row.appendChild(addButton);
    }

    // B4.4d.2–4: Compact, direct editing actions.
    row.appendChild(buildOutlineActionControls(node));

    // Show additional relationships without duplicating nodes.
    var extraCount = connections.filter(function (link) {
      return String(link.toId) === id &&
        String(link.fromId) !== String(node.parentId || "");
    }).length;

    if (extraCount) {
      var extra = document.createElement("span");
      extra.className = "diagram-outline-extra";
      extra.textContent =
        "+" + extraCount + " extra connection" +
        (extraCount === 1 ? "" : "s");
      row.appendChild(extra);
    }

    var childNodes = children[id] || [];
    var measures = Array.isArray(node.measures)
      ? node.measures : [];

    var addingChildHere = !!(
      activeOutlineTextEdit &&
      activeOutlineTextEdit.isNew &&
      activeOutlineTextEdit.parentId === id
    );

    if (childNodes.length || measures.length || addingChildHere) {
      var details = document.createElement("details");

      details.open =
        Object.prototype.hasOwnProperty.call(
          diagramOutlineOpenById, id
        )
          ? diagramOutlineOpenById[id]
          : node.level === "aim";

      var summary = document.createElement("summary");
      summary.appendChild(row);
      details.appendChild(summary);

      var childList = document.createElement("ul");


      // Measures stay with their own element and keep their order.
      measures.forEach(function (measure, measureIndex) {
        var measureRow = document.createElement("li");
        measureRow.className = "diagram-outline-measure";

        var meta = getMeasureTypeMeta(
          measure && measure.type
        );

        var bullet = document.createElement("span");
        bullet.textContent = "●";
        bullet.style.color = meta.color;
        bullet.setAttribute("aria-label", meta.label);
        measureRow.appendChild(bullet);

        var text = document.createElement("span");
        text.className = "diagram-outline-measure-text";
        text.textContent = typeof measure === "string"
          ? measure
          : (measure && measure.text) || "(Untitled measure)";

        var editMeasureButton = document.createElement("button");
        editMeasureButton.type = "button";
        editMeasureButton.className = "diagram-outline-measure-edit";
        editMeasureButton.textContent = "Edit";
        editMeasureButton.title = "Edit or delete this measure";
        editMeasureButton.setAttribute(
          "aria-label", "Edit or delete measure: " + text.textContent
        );

        editMeasureButton.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (!outlineActionCanStart()) return;
          editMeasureOnNode(node.id, measureIndex);
        });

        measureRow.appendChild(text);
        measureRow.appendChild(editMeasureButton);
        childList.appendChild(measureRow);
      });


            childNodes.forEach(function (child) {
        addNode(child, childList);
      });

      if (addingChildHere) {
        var draftItem = document.createElement("li");
        draftItem.className = "diagram-outline-draft-item";

        draftItem.appendChild(
          buildOutlineTextEditor({
            level: activeOutlineTextEdit.level
          })
        );

        childList.appendChild(draftItem);
        details.open = true;
      }

      details.appendChild(childList);

      details.addEventListener("toggle", function () {
        diagramOutlineOpenById[id] = details.open;
      });

      li.appendChild(details);

    } else {
      var leaf = document.createElement("div");
      leaf.className = "diagram-outline-leaf";
      leaf.appendChild(row);
      li.appendChild(leaf);
    }

    // B4.4c — Place an active editor beneath its element.
    if (
      activeOutlineTextEdit &&
      activeOutlineTextEdit.id === id
    ) {
      var editor = buildOutlineTextEditor(node);

      var branch = li.querySelector(":scope > details");

      if (branch) {
        // Keep this branch open while editing.
        branch.open = true;

        var childList =
          branch.querySelector(":scope > ul");

        branch.insertBefore(editor, childList);
      } else {
        // Change ideas and other leaf elements.
        li.appendChild(editor);
      }
    }

    list.appendChild(li);
  }

  // Start with aims and any unconnected elements.
  nodes.forEach(function (node) {
    var parentId = String(node.parentId || "");

    if (
      !parentId ||
      !lookup[parentId] ||
      parentId === String(node.id)
    ) {
      addNode(node, host);
    }
  });

  // Include anything remaining from unusual older diagrams.
  nodes.forEach(function (node) {
    addNode(node, host);
  });
}


/* B4.4b — Navigate from Outline to an existing diagram box. */

function locateDiagramNodeFromOutline(nodeId) {
  var id = String(nodeId);

  // Never navigate to an element that no longer exists.
  var exists = nodes.some(function (node) {
    return String(node.id) === id;
  });

  if (!exists) return;

  // Restore the visual diagram first.
  if (diagramViewMode === "outline") {
    switchDiagramView("diagram");
  }

  // Respect any existing safeguard that prevented switching.
  if (diagramViewMode !== "diagram") return;

  // Use the existing selection logic, but avoid toggling
  // off a box that is already selected.
  if (selectedDiagramNodeId !== id) {
    selectDiagramNode(id);
  }

  // Wait until the diagram has had time to become visible
  // and complete its layout after switching views.
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {

      var boxes = document.querySelectorAll(
        "#diagramColumns .diagram-node"
      );

      var target = Array.from(boxes).find(function (box) {
        return box.getAttribute("data-id") === id;
      });

      if (!target) return;

      // Focus the chosen element for keyboard users.
      // Prevent focus itself from causing an unwanted scroll.
      try {
        target.focus({ preventScroll: true });
      } catch (error) {
        target.focus();
      }

      // Bring the selected box into the visible area.
      target.scrollIntoView({
        behavior: window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto" : "smooth",
        block: "center",
        inline: "center"
      });

    });
  });
}

function switchDiagramView(view) {

  if (view !== "diagram" && view !== "outline") return;
  if (view === diagramViewMode) return;

  // Do not interrupt an unfinished edit.
    if (
    activeDiagramTextEdit ||
    activeOutlineTextEdit ||
    document.querySelector(
      "dialog[open], .diagram-measure-editor-overlay"
    )
  ) {
    alert(
      "Please save or cancel the current edit before switching views."
    );
    return;
  }

  var exportArea = document.getElementById("exportArea");
  var outline = document.getElementById("diagramOutlineView");
  var area = document.getElementById("diagramArea");
  var diagramButton = document.getElementById("btnViewDiagram");
  var outlineButton = document.getElementById("btnViewOutline");

  if (!exportArea || !outline) return;

  closeNodeContextMenu();
  closeMeasureContextMenu();

  diagramViewMode = view;

  // Clear visual selections without changing the diagram.
  selectedDiagramNodeId = null;
  selectedDiagramMeasure = null;
  selectedDiagramConnection = null;

  exportArea.hidden = view === "outline";
  outline.hidden = view !== "outline";

  if (area) {
    area.classList.toggle(
      "is-outline-view", view === "outline"
    );
  }

  if (diagramButton) {
    diagramButton.setAttribute(
      "aria-pressed", view === "diagram"
    );
  }

  if (outlineButton) {
    outlineButton.setAttribute(
      "aria-pressed", view === "outline"
    );
  }

  updateDiagramSelectionBar();
  updateDiagramConnectionBar();

  if (view === "outline") {
    renderDiagramOutline();

  } else {
    // Recalculate dimensions now the diagram is visible.
    measuredBoxHeightsById = {};
    measuredItemHeightsById = {};
    suppressAutosizeRelayout = false;

    renderDiagram();
  }
}

function initialiseDiagramViewSwitch() {
  var diagramButton = document.getElementById("btnViewDiagram");
  var outlineButton = document.getElementById("btnViewOutline");
  var exportArea = document.getElementById("exportArea");
  var outline = document.getElementById("diagramOutlineView");
  var area = document.getElementById("diagramArea");

  if (
    !diagramButton || !outlineButton ||
    !exportArea || !outline
  ) return;

  // Saved HTML copies also reopen in Diagram view.
  diagramViewMode = "diagram";
  exportArea.hidden = false;
  outline.hidden = true;

  if (area) area.classList.remove("is-outline-view");

  diagramButton.setAttribute("aria-pressed", "true");
  outlineButton.setAttribute("aria-pressed", "false");

  diagramButton.addEventListener("click", function () {
    switchDiagramView("diagram");
  });

  outlineButton.addEventListener("click", function () {
    switchDiagramView("outline");
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

  if (activeOutlineTextEdit) {
    alert(
      "Save or cancel the Outline text edit before exporting."
    );

    return Promise.reject(
      new Error("Unfinished Outline text edit.")
    );
  }

  // B4.4a.1: Always export the visual diagram.
  if (diagramViewMode === "outline") {
    switchDiagramView("diagram");

    return new Promise(function (resolve, reject) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          withSvgImageOverlay(runCapture).then(
            resolve, reject
          );
        });
      });
    });
  }

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

  svgClone.querySelectorAll(
    ".diagram-connection-hit"
  ).forEach(function (el) {
    el.remove();
  });

  svgClone.querySelectorAll(
    ".diagram-connection-visible"
  ).forEach(function (el) {
    el.setAttribute("stroke", "#666");
    el.setAttribute("stroke-width", "2.5");
    el.removeAttribute("data-selected");
  });

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

/* B4.3b — Convert Help topics into expandable sections. */

function initialiseHelpAccordions() {
  var dialog = document.querySelector("#helpOverlay .modal-dialog");

  // Do not build the sections more than once.
  if (!dialog || dialog.querySelector(".help-accordion")) return;

  // Find the existing Help headings.
  var headings = Array.from(dialog.children).filter(function (element) {
    return element.classList.contains("faq-question") ||
      element.tagName === "H3";
  });

  headings.forEach(function (heading) {

    var details = document.createElement("details");
    details.className = "help-accordion";

    // Keep only one Help section expanded at a time.
    details.setAttribute("name", "driver-help");

    var summary = document.createElement("summary");
    summary.textContent = heading.textContent.trim();

    var content = document.createElement("div");
    content.className = "help-accordion-content";

    dialog.insertBefore(details, heading);
    details.appendChild(summary);
    details.appendChild(content);

    // Move the existing content into its expandable section.
    // Preserve all paragraphs, lists and links.
    var current = heading.nextSibling;

    while (current) {
      if (current.nodeType === 1 && (
        current.classList.contains("faq-question") ||
        current.tagName === "H3"
      )) {
        break;
      }

      var next = current.nextSibling;
      content.appendChild(current);
      current = next;
    }

    heading.remove();
  });
}

function openHelpOverlay() {
  var overlay = document.getElementById("helpOverlay");
  if (!overlay) return;

  // Prepare the expandable sections on first opening.
  initialiseHelpAccordions();
  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
}

function closeHelpOverlay() {
  var overlay = document.getElementById("helpOverlay");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
}



/* B4.2b — Colour choices while editing element text. */

var closeInlineColourMenu = null;

function dismissInlineColourMenu() {
  if (closeInlineColourMenu) closeInlineColourMenu();
}

function previewInlineColour(nodeId, colour, newOption) {
  if (!activeDiagramTextEdit ||
      activeDiagramTextEdit.id !== nodeId) return;

  // Stage the colour until the edit is confirmed.
  activeDiagramTextEdit.pendingColour = colour;
  activeDiagramTextEdit.pendingColourOption = newOption || null;

  var field = document.getElementById("diagramInlineText");
  var box = field && field.closest(".diagram-node");
  if (!box) return;

  box.style.backgroundColor = colour || "#ffffff";
  box.style.borderColor = colour ? "#999" : "#d0d7de";
  box.style.color = colour
    ? getContrastingTextColor(colour)
    : "#000000";
}

function showInlineColourMenu(nodeId, trigger) {
  if (!activeDiagramTextEdit ||
      activeDiagramTextEdit.id !== nodeId) return;

  if (closeInlineColourMenu) {
    dismissInlineColourMenu();
    return;
  }

  var menu = document.createElement("div");
  menu.className = "diagram-inline-colour-menu";
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", "Choose element colour");

  var heading = document.createElement("div");
  heading.className = "diagram-inline-colour-heading";
  heading.textContent = "Box colour";
  menu.appendChild(heading);

  function addChoice(name, colour, action) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "diagram-inline-colour-choice";

    var swatch = document.createElement("span");
    swatch.className = "diagram-inline-colour-swatch";
    swatch.style.backgroundColor = colour || "#ffffff";
    swatch.setAttribute("aria-hidden", "true");

    var label = document.createElement("span");
    label.textContent = name;

    button.appendChild(swatch);
    button.appendChild(label);

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      dismissInlineColourMenu();
      action();
    });

    menu.appendChild(button);
  }

  function chooseColour(value) {
    previewInlineColour(nodeId, value, null);

    var field = document.getElementById("diagramInlineText");
    if (field) field.focus();
  }

  addChoice("No colour", "", function () {
    chooseColour("");
  });

  colorOptions.forEach(function (option) {
    addChoice(option.label, option.value, function () {
      chooseColour(option.value);
    });
  });

  addChoice("+ New colour…", null, function () {
    openQuickColourDialogForNode(nodeId);
  });

  document.body.appendChild(menu);

  // Float near the palette button without moving the boxes.
  var rect = trigger.getBoundingClientRect();
  var bounds = menu.getBoundingClientRect();

  var left = Math.min(
    rect.left,
    window.innerWidth - bounds.width - 8
  );

  var top = rect.bottom + 6;

  if (top + bounds.height > window.innerHeight - 8) {
    top = rect.top - bounds.height - 6;
  }

  menu.style.left = Math.max(8, left) + "px";
  menu.style.top = Math.max(8, top) + "px";

  function close() {
    document.removeEventListener("pointerdown", outside, true);
    menu.remove();

    if (closeInlineColourMenu === close) {
      closeInlineColourMenu = null;
    }
  }

  function outside(event) {
    if (!menu.contains(event.target) &&
        event.target !== trigger) {
      close();
    }
  }

  menu.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      trigger.focus();
    }
  });

  document.addEventListener("pointerdown", outside, true);
  closeInlineColourMenu = close;

  var first = menu.querySelector("button");
  if (first) first.focus();
}

function openQuickColourDialogForNode(nodeId) {

  var targetNode = nodes.find(function (n) { return n.id === nodeId; });
  if (!targetNode || document.getElementById("quickColourDialog")) return;

  var dialog = document.createElement("dialog");
  dialog.id = "quickColourDialog";
  dialog.className = "quick-colour-dialog";
  dialog.innerHTML =
    '<form id="quickColourForm">' +
      '<h2 id="quickColourTitle">Create and apply colour</h2>' +
      '<p id="quickColourTarget" class="quick-colour-target"></p>' +
      '<label for="quickColourName">Colour name (optional)</label>' +
      '<input id="quickColourName" type="text" maxlength="80" ' +
        'placeholder="e.g. Workforce improvement">' +
      '<label for="quickColourValue">Choose colour</label>' +
      '<input id="quickColourValue" type="color">' +
      '<p id="quickColourError" class="quick-colour-error" role="alert"></p>' +
      '<div class="quick-colour-actions">' +
        '<button type="button" class="secondary" id="quickColourCancel">Cancel</button>' +
        '<button type="submit">Save and apply</button>' +
      '</div>' +
    '</form>';

  var nameInput = dialog.querySelector("#quickColourName");
  var colourInput = dialog.querySelector("#quickColourValue");
  var errorText = dialog.querySelector("#quickColourError");
  dialog.querySelector("#quickColourTarget").textContent =
    "Selected element: " + targetNode.text;
  colourInput.value = defaultNewColorValue;

  dialog.querySelector("#quickColourCancel").addEventListener("click", function () {
    dialog.close();
  });

  dialog.querySelector("#quickColourForm").addEventListener("submit", function (e) {
    e.preventDefault();

    var colour = colourInput.value.toLowerCase();
    var label = nameInput.value.trim();

    if (!/^#[0-9a-f]{6}$/.test(colour)) {
      errorText.textContent = "Choose a valid colour.";
      colourInput.focus();
      return;
    }

    var existing = findColorOptionByValue(colour);
    if (existing) {
      errorText.textContent = 'That colour already exists as "' +
        existing.label + '". Cancel and select it from the menu.';
      colourInput.focus();
      return;
    }

    // Generate a unique default name when the name is blank.
    if (!label) {
      var number = 1;
      while (colorOptions.some(function (option) {
        return option.label.toLowerCase() === ("colour " + number);
      })) number++;
      label = "Colour " + number;
    }

    var currentNode = nodes.find(function (n) { return n.id === nodeId; });
    if (!currentNode) {
      errorText.textContent = "This element is no longer available.";
      return;
    }


    if (activeDiagramTextEdit &&
        activeDiagramTextEdit.id === nodeId) {

      // Stage this named colour until the inline tick is clicked.
      previewInlineColour(nodeId, colour, {
        label: label,
        value: colour
      });

      dialog.close();
      return;
    }

    // Existing right-click behaviour remains unchanged.
    colorOptions.push({ label: label, value: colour });
    currentNode.color = colour;
    updateAllViews();
    dialog.close();
  });


  dialog.addEventListener("close", function () {
    dialog.remove();

    // Return to the text editor if it is still active.
    if (activeDiagramTextEdit &&
        activeDiagramTextEdit.id === nodeId) {

      var textField = document.getElementById(
        "diagramInlineText"
      );

      if (textField) textField.focus();
    }
  });

  document.body.appendChild(dialog);
  dialog.showModal();
  nameInput.focus();
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

  if (hasMeasures) {
  addSubItem(
    "Double-click a measure to edit; right-click for actions.",
    null,
    true
  );
}

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


    function addNewColourMenuItem() {
      var separator = document.createElement("div");
      separator.className = "quick-colour-menu-divider";
      sub.appendChild(separator);

      addSubItem("＋ New colour…", function () {
        var targetId = n.id;
        closeNodeContextMenu();
        openQuickColourDialogForNode(targetId);
      });
    }


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
      addNewColourMenuItem();
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

    addNewColourMenuItem();
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


/* B5.3b — Local-only, editable AI prompt builder. */
function createAiDriverDiagramPrompt(options) {
  var scenarios = {
    draft: {
      heading: "Create an initial draft",
      purpose: "Use the supplied project documents and context to propose a deliberately provisional driver diagram. It should be recognisable to the group but not appear agreed or finished. Expect substantial discussion and revision.",
      task: "Identify the stated aim, existing understanding and any ideas the group has already discussed. Organise them into a concise theory of change. Distinguish material drawn from sources from your own suggestions."
    },
    synthesis: {
      heading: "Synthesise existing team thinking",
      purpose: "Translate an improvement group's engagement findings, fishbone diagram, workshop outputs or other existing understanding into a proposed driver diagram. Faithfully represent the group's thinking, including disagreement.",
      task: "A fishbone identifies possible causes; a driver diagram expresses what needs to be in place for improvement. Interpret the findings accordingly rather than just renaming fishbone branches. Do not invent agreement or evidence."
    },
    explore: {
      heading: "Explore possible approaches",
      purpose: "Explore a complex improvement objective to illustrate plausible drivers, possible changes, uncertainties and people who should be engaged. This is NOT an agreed plan or a recommendation to implement interventions.",
      task: "Where reliable information is available, distinguish it from inference and speculation. Identify stakeholders, dependencies, trade-offs and important missing local information. Do not fabricate citations or claim to have reviewed sources you cannot access."
    }
  };

  var wording = {
    preserve: "Preserve the terminology and language style of the supplied material. Only suggest wording changes separately.",
    clarify: "Suggest clearer wording where it helps, while retaining the original meaning. Make substantial rewording visible for review.",
    alternatives: "Offer alternative wording for discussion; do not imply the group has adopted your alternatives."
  };
  var measures = {
    none: "Do not generate measures. Leave measures_json blank in the CSV.",
    existing: "Include only measures already identified in the source material, and ask which the group wants retained. Do not add new measures.",
    few: "Propose a very small, selective set of measures, clearly labelled as suggestions for discussion. Ask the user to confirm which to include."
  };
  var changes = {
    existing: "Include only change ideas actually identified in the supplied material. Do not invent additional interventions.",
    none: "Do not include change ideas at this stage. It is acceptable for the diagram to stop at secondary drivers.",
    suggest: "Offer a limited number of possible change ideas separately from the group's existing ideas. Ask which, if any, to include."
  };
  var colours = {
    app: "Leave colour values blank. Presentation formatting will be chosen in the Driver Diagram Tool.",
    branch: "If the user confirms this scheme, assign an accessible six-digit hex colour to each primary driver and its descendants; leave the Aim uncoloured unless asked.",
    level: "If the user confirms this scheme, assign one accessible six-digit hex colour per level: Aim, primary, secondary and change.",
    custom: "Before generating CSV, ask the user which six-digit hex colours they want. Do not guess the palette."
  };
  var scenario = scenarios[options.scenario] || scenarios.draft;

  return [
    "AI-ASSISTED DRIVER DIAGRAM — " + scenario.heading,
    "",
    "YOUR ROLE AND PURPOSE",
    scenario.purpose,
    scenario.task,
    "This diagram must ultimately reflect the improvement team's own beliefs about how improvement will happen. AI cannot determine that consensus or validate the team's theory of change.",
    "",
    "INFORMATION GOVERNANCE",
    "Do not ask me to paste patient-identifiable, staff-identifiable, other personal or confidential information into an AI service unless its use has been specifically authorised by my organisation for this information and task. Removing names alone may not remove identifiability. If approval is uncertain, prompt me to consult local information-governance guidance first.",
    "",
    "WORK WITH ME IN STAGES — DO NOT RUSH AHEAD",
    "1. Ask what source material and context I can appropriately share using my organisation-approved AI environment. Do not invent details that are absent.",
    "2. Summarise your understanding, then ask a maximum of three material clarification questions at a time. STOP and wait for my answers. Do not answer your own questions, and do not repeat information already supplied.",
    "3. Produce a readable, concise draft hierarchy (Aim, primary drivers, secondary drivers, and change ideas only if requested). Distinguish source-derived content from AI suggestions, and highlight important gaps, assumptions, disagreements and missing perspectives outside the diagram.",
    "4. Invite me to review, correct and refine the wording, relationships and scope. Do not treat a plausible diagram as an agreed improvement plan.",
    "5. Generate the final CSV ONLY when I explicitly request it. Do not automatically move from the draft to CSV.",
    "",
    "CONTENT PREFERENCES",
    "Wording: " + (wording[options.wording] || wording.preserve),
    "Measures: " + (measures[options.measures] || measures.none),
    "Change ideas: " + (changes[options.changes] || changes.existing),
    "Colour formatting: " + (colours[options.colours] || colours.app),
    "Keep the number of drivers and changes manageable. Avoid bland or generic management language. A polished-looking diagram is not evidence of validity.",
    "",
    "CSV OUTPUT CONTRACT (ONLY WHEN I REQUEST CSV)",
    "Return only one fenced csv code block, with exactly these headers, in exactly this order:",
    "id,level,parent_id,text,color,extra_parents,measures_json",
    "Use exactly one aim row with a blank parent_id. Valid levels are aim, primary, secondary and change. Give each row a unique sequential numeric ID starting at 1. Each primary has the Aim as parent, each secondary has a primary as parent and each change has a secondary as parent.",
    "Maintain the reviewed ordering and wording. No self-connections, missing parents or cycles. Use extra_parents only for genuine additional connections we have explicitly agreed; use semicolon-separated IDs.",
    "Leave optional fields blank unless requested or agreed. If including measures, encode measures_json as a JSON array of objects containing type and text. Permitted types: outcome, process, balancing and none. Use CSV double-quote escaping correctly, including quoted JSON cells, commas and line breaks.",
    "Do not include auto_size: the app enables automatic sizing by default. Do not introduce extra columns. Check the CSV against these rules before sending it.",
    "",
    "FIRST RESPONSE",
    "Briefly explain what you need from me for this scenario. Ask up to three essential questions, then STOP and wait for my answers."
  ].join("\n");
}

function initialiseAiPromptBuilder() {
  var editor = document.getElementById("aiPromptEditor");
  var makeButton = document.getElementById("aiBuildPrompt");
  var resetButton = document.getElementById("aiResetPrompt");
  var copyButton = document.getElementById("aiCopyPrompt");
  var status = document.getElementById("aiPromptStatus");
  if (!editor || !makeButton || !resetButton || !copyButton || !status) return;

  var fields = {
    scenario: document.getElementById("aiPromptScenario"),
    wording: document.getElementById("aiPromptWording"),
    measures: document.getElementById("aiPromptMeasures"),
    changes: document.getElementById("aiPromptChanges"),
    colours: document.getElementById("aiPromptColours")
  };
  if (Object.keys(fields).some(function (key) { return !fields[key]; })) return;

  var lastGenerated = "";
  function proposedText() {
    var options = {};
    Object.keys(fields).forEach(function (key) { options[key] = fields[key].value; });
    return createAiDriverDiagramPrompt(options);
  }
  function setButtons() {
    copyButton.disabled = !editor.value.trim();
    resetButton.disabled = !lastGenerated;
  }
  function replacePrompt(confirmEdits) {
    if (confirmEdits && editor.value.trim() && editor.value !== lastGenerated &&
        !window.confirm("Replace your edited prompt with the recommended wording?")) {
      return;
    }
    lastGenerated = proposedText();
    editor.value = lastGenerated;
    status.textContent = "Prompt created. Review and edit it before copying.";
    setButtons();
  }

  makeButton.addEventListener("click", function () { replacePrompt(true); });
  resetButton.addEventListener("click", function () { replacePrompt(true); });
  editor.addEventListener("input", function () {
    status.textContent = "Your edits are kept until you choose to replace them.";
    setButtons();
  });
  Object.keys(fields).forEach(function (key) {
    fields[key].addEventListener("change", function () {
      status.textContent = editor.value.trim()
        ? "Preferences changed. Select Create / update prompt to apply them; your text has not been overwritten."
        : "Preferences ready. Select Create / update prompt.";
    });
  });

  function fallbackCopy() {
    editor.focus();
    editor.select();
    var success = false;
    try { success = document.execCommand("copy"); } catch (error) { success = false; }
    status.textContent = success
      ? "Prompt copied. Paste it only into an AI service authorised for your task and information."
      : "Automatic copying was blocked. Select all the prompt text and copy it manually.";
  }
  copyButton.addEventListener("click", function () {
    if (!editor.value.trim()) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(editor.value).then(function () {
        status.textContent = "Prompt copied. Paste it only into an AI service authorised for your task and information.";
      }).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  });
  setButtons();
}

document.addEventListener("DOMContentLoaded", function () {

/* B4.1b.1 — Refresh lines after browser zoom or resizing. */

var zoomRedrawTimer = null;

function redrawLinesForViewport() {
  var canvas = document.getElementById("diagramCanvas");
  var svg = document.getElementById("diagramConnections");

  if (canvas && svg) {
    drawConnections(canvas, svg);
  }
}


function redrawLinesAfterLayout() {
  // Allow the browser to finish recalculating layout.
  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        redrawLinesForViewport();
      });
    });
  } else {
    redrawLinesForViewport();
  }
}

function scheduleViewportLineRedraw() {
  clearTimeout(zoomRedrawTimer);

  // Wait briefly for zoom or resizing to settle.
  zoomRedrawTimer = setTimeout(function () {
    redrawLinesAfterLayout();
  }, 180);
}


// Standard browser zoom and window resizing.
window.addEventListener("resize", function () {
  scheduleViewportLineRedraw();
});

// Pinch zoom and visual viewport changes.
if (window.visualViewport) {
  window.visualViewport.addEventListener(
    "resize",
    function () {
      scheduleViewportLineRedraw(true);
    }
  );
}

// Also respond when the diagram itself changes size.
if (window.ResizeObserver) {
  var zoomLineObserver = new window.ResizeObserver(
    function () {
      scheduleViewportLineRedraw();
    }
  );

  var diagramToObserve =
    document.getElementById("diagramCanvas");

  if (diagramToObserve) {
    zoomLineObserver.observe(diagramToObserve);
  }
}

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


/* B3.1 — Undo/Redo controls */

var undoDiagramBtn =
  document.getElementById("btnDiagramUndo");

var redoDiagramBtn =
  document.getElementById("btnDiagramRedo");

if (undoDiagramBtn) {
  undoDiagramBtn.addEventListener(
    "click",
    undoDiagramChange
  );
}

if (redoDiagramBtn) {
  redoDiagramBtn.addEventListener(
    "click",
    redoDiagramChange
  );
}

// Keyboard shortcuts.
document.addEventListener("keydown", function (e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) {
    return;
  }

  // Leave native text-field undo/redo alone.
  if (e.target && e.target.closest &&
      e.target.closest(
        'input, textarea, select, [contenteditable="true"]'
      )) {
    return;
  }

  var key = e.key.toLowerCase();

  if (key === "z" && !e.shiftKey) {
    e.preventDefault();
    undoDiagramChange();
  } else if (
    (key === "z" && e.shiftKey) ||
    key === "y"
  ) {
    e.preventDefault();
    redoDiagramChange();
  }
});


  /* B5.3a.1 — AI guidance modal: move and connect existing guidance. */
  var aiPanel = document.getElementById("aiAssistancePanel");
  var aiDialog = document.getElementById("aiGuidanceDialog");
  var aiContent = document.getElementById("aiGuidanceContent");
  var aiTrigger = document.getElementById("btnAiGuidance");
  var aiClose = document.getElementById("btnCloseAiGuidance");

  if (aiPanel && aiDialog && aiContent && aiTrigger && aiClose) {
    // The actual guidance content is retained; no duplicate text or warning.
    aiContent.appendChild(aiPanel);
    aiPanel.open = true;

    aiTrigger.addEventListener("click", function () {
      if (!aiDialog.open) {
        aiDialog.showModal();
        aiClose.focus();
      }
    });

    aiClose.addEventListener("click", function () {
      aiDialog.close();
    });

    // Also handles Escape, which closes a native <dialog>.
    aiDialog.addEventListener("close", function () {
      aiTrigger.focus();
    });

    // Optional click on the dark backdrop closes the window.
    aiDialog.addEventListener("click", function (event) {
      if (event.target !== aiDialog) return;
      var rect = aiDialog.getBoundingClientRect();
      if (event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom) {
        aiDialog.close();
      }
    });
  }

  initialiseAiPromptBuilder();

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


/* B2.2 — Click-away and Escape for measures */

document.addEventListener("click", function (e) {
  if (activeDiagramTextEdit) return;

  // Don't clear selection while a modal editor is open.
  if (document.querySelector(
    "dialog[open], .diagram-measure-editor-overlay"
  )) return;

  if (e.target.closest(
    ".diagram-measure-row, " +
    ".diagram-measure-context-menu, " +
    ".diagram-measure-editor-overlay"
  )) return;

  closeMeasureContextMenu();

  if (selectedDiagramMeasure) {
    clearSelectedDiagramMeasure();
  }
});

document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  if (activeDiagramTextEdit) return;

  // Let an open editor handle Escape first.
  if (document.querySelector(
    "dialog[open], .diagram-measure-editor-overlay"
  )) return;

  closeMeasureContextMenu();

  if (selectedDiagramMeasure) {
    clearSelectedDiagramMeasure();
  }
});

document.addEventListener(
  "scroll", closeMeasureContextMenu, true
);

window.addEventListener(
  "resize", closeMeasureContextMenu
);


/* B1.5: Deselect when clicking blank diagram space */

var diagramClickSurface =
  document.getElementById("diagramCanvasWrapper");

if (diagramClickSurface) {
  diagramClickSurface.addEventListener("click", function (e) {

    // Never discard text that is being edited.
    if (activeDiagramTextEdit) return;

    // Do not deselect when clicking a diagram item
    // or an editable column heading.
    if (e.target.closest(
      ".diagram-item, .diagram-column-title"
    )) {
      return;
    }

    // Nothing to deselect.
    if (selectedDiagramNodeId === null) return;

    // Clear the selection without redrawing the diagram.
    selectedDiagramNodeId = null;

    document.querySelectorAll(
      ".diagram-node.diagram-selected"
    ).forEach(function (box) {
      box.classList.remove("diagram-selected");
    });

    updateDiagramSelectionBar();
  });
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



/* B3.3 — Individual connection formatting controls */

var connectionFormatSelect =
  document.getElementById("connectionFormatSelect");

var connectionFormatClear =
  document.getElementById("connectionFormatClear");

if (connectionFormatSelect) {
  connectionFormatSelect.addEventListener("change", function () {
    if (!selectedDiagramConnection) return;

    var conn = findDiagramConnection(
      selectedDiagramConnection.fromId,
      selectedDiagramConnection.toId
    );

    if (!conn) return;

    var style = connectionFormatSelect.value === "default"
      ? ""
      : normaliseConnectionOverride(connectionFormatSelect.value);

    if (style) {
      conn.style = style;
    } else {
      delete conn.style;
    }

    // One history entry for this formatting change.
    recordDiagramHistory();

    var canvas = document.getElementById("diagramCanvas");
    var svg = document.getElementById("diagramConnections");

    if (canvas && svg) drawConnections(canvas, svg);
    updateDiagramConnectionBar();
  });
}


/* B3.3a: Visual connection-style choices */

document.querySelectorAll(
  "#connectionFormatBar [data-connection-style]"
).forEach(function (button) {

  button.addEventListener("click", function (event) {
    event.stopPropagation();

    var select = document.getElementById(
      "connectionFormatSelect"
    );

    if (!select || !selectedDiagramConnection) return;

    select.value = button.getAttribute(
      "data-connection-style"
    );

    // Reuse the existing B3.3 style-change logic.
    select.dispatchEvent(
      new Event("change", { bubbles: true })
    );
  });

});


if (connectionFormatClear) {
  connectionFormatClear.addEventListener(
    "click", clearDiagramConnectionSelection
  );
}

document.addEventListener("click", function (e) {
  if (activeDiagramTextEdit) return;

  if (e.target.closest(
    "#connectionFormatBar, .diagram-connection-hit"
  )) return;

  clearDiagramConnectionSelection();
});

document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape" || activeDiagramTextEdit) return;

  if (document.querySelector(
    "dialog[open], .diagram-measure-editor-overlay"
  )) return;

  clearDiagramConnectionSelection();
});



/* B2.5: Live connection style preview */

var connectionStyleInput =
  document.getElementById("connectionStyleInput");

if (connectionStyleInput) {
  connectionStyleInput.addEventListener("change", function () {

    diagramAppearance.connectionStyle =
      normaliseConnectionStyle(connectionStyleInput.value);

recordDiagramHistory();

    var canvas = document.getElementById("diagramCanvas");
    var svg = document.getElementById("diagramConnections");

    // Redraw lines without rebuilding the diagram boxes.
    if (canvas && svg) {
      drawConnections(canvas, svg);
    }
  });
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
      recordDiagramHistory();
    });
  }


  // Set up collapsible sections in controls panel
  setupCollapsibleSections();

  // B4.4a.1: Set up view buttons before loading diagram data.
  initialiseDiagramViewSwitch();

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

// B3.1: The initial diagram is our first history state.
// This runs after normal or portable-HTML project loading.
initialiseDiagramHistory();

});

