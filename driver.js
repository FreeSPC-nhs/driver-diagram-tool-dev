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

/* ---------- Colours and key: one shared popup ---------- */

// Saved colours are identified by their hex values in existing diagrams.
var colorOptions = [];
var editingColorValue = null; // Retained for older history/clear paths.
var defaultNewColorValue = "#fff7cc";

function findColorOptionByValue(value) {
  if (!value) return null;
  return colorOptions.find(function (option) {
    return (option.value || "").toLowerCase() ===
      String(value).toLowerCase();
  }) || null;
}

function resetColorEditorForm() {
  // Compatibility with saved-project import and Undo/Redo.
  editingColorValue = null;
}

function isColorEditorDirty() {
  // The modal dialog now owns all unfinished colour edits.
  return false;
}

function setColorEditorStatus(message, type) {
  var status = document.getElementById("colorEditStatus");
  if (!status) return;
  status.textContent = message || "";
}

function beginColorEdit(value) {
  if (!findColorOptionByValue(value)) return;
  openQuickColourDialogForNode(null, { editValue: value });
}

function initialiseColorEditor() {
  var addButton = document.getElementById("btnSidebarColourPalette");
  if (addButton) {
    addButton.addEventListener("click", function () {
      openQuickColourDialogForNode(null);
    });
  }

  var helpButton = document.getElementById("colourHelpButton");
  if (helpButton) {
    // The help tooltip sits in a collapsible heading: don't toggle that heading.
    helpButton.addEventListener("click", function (event) {
      event.stopPropagation();
    });
  }
  renderColorOptionsList();
}

function refreshColorSelect() {
  var select = document.getElementById("nodeColor");
  if (!select) return;

  var currentValue = select.value;
  select.innerHTML = "";
  var noColour = document.createElement("option");
  noColour.value = "";
  noColour.textContent = "No colour";
  select.appendChild(noColour);

  colorOptions.forEach(function (opt) {
    var item = document.createElement("option");
    item.value = opt.value;
    item.textContent = opt.label + " (" + opt.value + ")";
    select.appendChild(item);
  });

  if (Array.from(select.options).some(function (item) {
    return item.value === currentValue;
  })) select.value = currentValue;
}

function deleteColorOptionByValue(value) {
  var option = findColorOptionByValue(value);
  if (!option) return;

  var usageCount = nodes.filter(function (node) {
    return (node.color || "").toLowerCase() ===
      value.toLowerCase();
  }).length;

  var message = 'Delete the colour "' + option.label + '"?';
  if (usageCount) {
    message += "\n\nIt is used on " + usageCount +
      (usageCount === 1 ? " box." : " boxes.") +
      " These boxes will return to having no colour.";
  }
  if (!window.confirm(message)) return;

  colorOptions = colorOptions.filter(function (entry) {
    return (entry.value || "").toLowerCase() !== value.toLowerCase();
  });
  nodes.forEach(function (node) {
    if ((node.color || "").toLowerCase() === value.toLowerCase()) {
      node.color = "";
    }
  });

  updateAllViews();
  setColorEditorStatus('Colour "' + option.label + '" deleted.', "success");
}

function renderColorOptionsList() {
  var list = document.getElementById("colorOptionsList");
  if (!list) return;
  list.innerHTML = "";

  if (!colorOptions.length) {
    var empty = document.createElement("li");
    empty.className = "colour-options-empty";
    empty.textContent = "No colours added yet.";
    list.appendChild(empty);
    return;
  }

  colorOptions.forEach(function (option) {
    var row = document.createElement("li");
    row.className = "colour-option-row";

    var swatch = document.createElement("span");
    swatch.className = "colour-option-swatch";
    swatch.style.backgroundColor = option.value;
    swatch.title = option.value.toUpperCase();

    var name = document.createElement("span");
    name.className = "colour-option-name";
    name.textContent = option.label;

    var actions = document.createElement("span");
    actions.className = "colour-option-actions";

    var editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "colour-row-button";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", "Edit " + option.label);
    editButton.addEventListener("click", function () {
      beginColorEdit(option.value);
    });

    var deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "colour-row-button delete";
    deleteButton.textContent = "🗑";
    deleteButton.title = "Delete " + option.label;
    deleteButton.setAttribute("aria-label", "Delete " + option.label);
    deleteButton.addEventListener("click", function () {
      deleteColorOptionByValue(option.value);
    });

    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    row.appendChild(swatch);
    row.appendChild(name);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

// CSV imports can supply hex colours without names.
function rebuildColorOptionsFromNodes() {
  var seen = {};
  nodes.forEach(function (node) {
    if (node.color) seen[node.color.toLowerCase()] = true;
  });
  colorOptions = Object.keys(seen).map(function (value, index) {
    return { label: "Colour " + (index + 1), value: value };
  });
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
  if (!panel || panel._collapsibleBound) return;
  panel._collapsibleBound = true;

  // Native buttons support Enter, Space and screen readers.
  panel.querySelectorAll("button.collapsible-header[data-target]")
    .forEach(function (button) {
      var section = document.getElementById(button.dataset.target);
      if (!section) return;

      function syncState() {
        var collapsed = section.classList.contains("is-collapsed");
        button.setAttribute("aria-expanded", String(!collapsed));
        var indicator = button.querySelector(".collapsible-indicator");
        if (indicator) indicator.textContent = collapsed ? "▸" : "▾";
      }

      syncState();
      button.addEventListener("click", function () {
        section.classList.toggle("is-collapsed");
        syncState();
      });
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

      if (option) {
        var existingOption = findColorOptionByValue(option.value);

        if (existingOption) {
          existingOption.label = option.label;
        } else {
          colorOptions.push(option);
        }
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


/* Prevent losing unfinished edits during file operations. */
function blockFileActionDuringEdit(action) {
  if (!activeOutlineTextEdit && !activeDiagramTextEdit) {
    return false;
  }

  var location = activeOutlineTextEdit
    ? "Outline"
    : "diagram box";

  alert(
    "Save or cancel the " + location +
    " edit before " + action + ".\n\n" +
    "Your diagram has not been changed."
  );

  return true;
}


/* Get PapaParse for inclusion in saved HTML diagrams. */
function getPapaSourceForPortableExport() {
  // When reopening an already-saved diagram, reuse
  // its embedded copy of PapaParse.
  var embedded = document.getElementById("portablePapaSource");

  if (embedded && (embedded.textContent || "").trim()) {
    return Promise.resolve(embedded.textContent);
  }

  // Otherwise, find the repository-hosted library.
  var parserScript = Array.from(
    document.querySelectorAll("script[src]")
  ).find(function (script) {
    return /(^|\/)papaparse\.min\.js([?#]|$)/i.test(
      script.getAttribute("src") || ""
    );
  });

  if (!parserScript) {
    return Promise.reject(
      new Error("Could not find papaparse.min.js.")
    );
  }

  return fetch(parserScript.src, { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error(
          "Could not load PapaParse: HTTP " + response.status
        );
      }
      return response.text();
    });
}




function downloadPortableHtml() {

  if (blockFileActionDuringEdit("saving the diagram")) return;


  if (!nodes.length) {    alert("There is no driver diagram to save.");
    return;
  }

  var projectData = getPortableProjectData();
  var projectJson = makeJsonSafeForHtml(projectData);


  Promise.all([
    getDriverSourceForPortableExport(),
    getPapaSourceForPortableExport()
  ]).then(function (sources) {
    var driverSource = sources[0];
    var papaSource = sources[1];

      /*
        Clone the current page.

        Event listeners are not included in the clone, so they
        will be recreated normally when the saved file opens.
      */
      var htmlClone =
        document.documentElement.cloneNode(true);


      // Embed PapaParse directly in the saved HTML.
      var papaReference = Array.from(
        htmlClone.querySelectorAll("script")
      ).find(function (script) {
        return script.id === "portablePapaSource" ||
          /(^|\/)papaparse\.min\.js([?#]|$)/i.test(
            script.getAttribute("src") || ""
          );
      });

      if (!papaReference) {
        throw new Error(
          "Could not find the PapaParse script in the page."
        );
      }

      var portablePapaScript =
        document.createElement("script");

      portablePapaScript.id = "portablePapaSource";

      portablePapaScript.textContent =
        papaSource.replace(
          /<\/script/gi,
          "<\\/script"
        );

      papaReference.replaceWith(portablePapaScript);



      // Restore default panel/menu states in portable saves.
      // An icon-only collapsed panel must never become impossible to reopen.
      var panelInCopy = htmlClone.querySelector("#controlsPanel");
      if (panelInCopy) panelInCopy.style.display = "";
      var mainInCopy = htmlClone.querySelector("main");
      if (mainInCopy) {
        mainInCopy.style.gridTemplateColumns = "";
        mainInCopy.classList.remove("sidebar-collapsed");
      }
      var panelButtonInCopy = htmlClone.querySelector("#btnToggleControls");
      if (panelButtonInCopy) {
        panelButtonInCopy.setAttribute("aria-expanded", "true");
        panelButtonInCopy.setAttribute("aria-label", "Hide editing panel");
        panelButtonInCopy.title = "Hide editing panel";
      }
      var exportMenuInCopy = htmlClone.querySelector("#exportChartMenu");
      if (exportMenuInCopy) exportMenuInCopy.removeAttribute("open");


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

      // Clear temporary copy feedback in saved HTML.
      var copyFeedbackInCopy =
        htmlClone.querySelector("#aiCopyFeedback");

      if (copyFeedbackInCopy) {
        copyFeedbackInCopy.hidden = true;
        copyFeedbackInCopy.textContent = "";
      }

      // Never preserve pasted CSV in an editable HTML copy.
      var pastedCsvInCopy =
        htmlClone.querySelector("#aiCsvPasteInput");

      if (pastedCsvInCopy) {
        pastedCsvInCopy.value = "";
        pastedCsvInCopy.defaultValue = "";
        pastedCsvInCopy.textContent = "";
      }

      var pastedCsvStatusInCopy =
        htmlClone.querySelector("#aiCsvPasteStatus");

      if (pastedCsvStatusInCopy) {
        pastedCsvStatusInCopy.textContent = "";
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
        "The application could not embed its JavaScript or stylesheet. " +
	"Try saving from the hosted development website.\n\n" +
        "Technical detail: " +
        error.message
      );
    });
}


/* ---------- CSV import / export ---------- */

function downloadCsv() {

  if (blockFileActionDuringEdit("downloading a CSV backup")) return;

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
        ),
        // Explicit marker ensures safe spreadsheet escaping can be
        // reversed when this app reopens the CSV backup.
        csv_safety_version: "apostrophe-v1"


    };
  });


  // Prefix potentially executable spreadsheet cells. Only CSV output
  // is escaped; source diagram content remains unchanged.
  var spreadsheetSafeRows = dataForCsv.map(function (row) {
    var safe = {};
    Object.keys(row).forEach(function (key) {
      var value = row[key];
      safe[key] = typeof value === "string" &&
        (value.charAt(0) === "'" ||
         /^[\s\u0000-\u001f]*[=+\-@]/.test(value))
        ? "'" + value
        : value;
    });
    return safe;
  });
  var csv = Papa.unparse(spreadsheetSafeRows, { quotes: true });
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


function uploadCsv(file, onFinished) {
  if (blockFileActionDuringEdit("opening a CSV file")) {
    if (typeof onFinished === "function") {
      onFinished(false);
    }
    return;
  }




  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      // Restore exact original values in CSV backups created by this
      // version. Never strip apostrophes from older or external CSVs.
      (results.data || []).forEach(function (row) {
        if (!row || row.csv_safety_version !== "apostrophe-v1") return;
        Object.keys(row).forEach(function (key) {
          var value = row[key];
          if (typeof value === "string" &&
              (value.slice(0, 2) === "''" ||
               (value.charAt(0) === "'" &&
                /^[\s\u0000-\u001f]*[=+\-@]/.test(value.slice(1))))) {
            row[key] = value.slice(1);
          }
        });
      });

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

        if (typeof onFinished === "function") {
          onFinished(false);
        }

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

      if (typeof onFinished === "function") {
        onFinished(true, nodes.length);
      }
    },

    error: function (error) {
      alert(
        "CSV could not be read. Your current diagram has not changed.\n\n" +
        (error && error.message
          ? error.message
          : "Please check the selected file.")
      );

      if (typeof onFinished === "function") {
        onFinished(false);
      }
    }  });
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



  // Saved colour choices, using the same flow as the diagram palette.
  var colourDetails = document.createElement("details");
  colourDetails.className = "diagram-outline-colour-details";

  var colourSummary = document.createElement("summary");
  colourSummary.textContent = "Change colour";
  colourDetails.appendChild(colourSummary);

  var colourChoices = document.createElement("div");
  colourChoices.className = "diagram-outline-colour-choices";

  function addOutlineColourChoice(label, colour, isNew) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "diagram-outline-colour-choice";

    if (!isNew && colour) {
      var swatch = document.createElement("span");
      swatch.className = "diagram-outline-colour-swatch";
      swatch.style.backgroundColor = colour;
      swatch.setAttribute("aria-hidden", "true");
      button.appendChild(swatch);
    }

    var text = document.createElement("span");
    text.textContent = label;
    button.appendChild(text);

    if (!isNew && (node.color || "").toLowerCase() ===
        (colour || "").toLowerCase()) {
      var tick = document.createElement("span");
      tick.className = "diagram-outline-colour-current";
      tick.textContent = "✓";
      tick.setAttribute("aria-hidden", "true");
      button.appendChild(tick);
      button.setAttribute("aria-pressed", "true");
    } else if (!isNew) {
      button.setAttribute("aria-pressed", "false");
    }

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!outlineActionCanStart()) return;
      closeMenu();

      if (isNew) {
        openQuickColourDialogForNode(node.id);
      } else if ((node.color || "").toLowerCase() !==
                 (colour || "").toLowerCase()) {
        node.color = colour;
        updateAllViews();
      }
    });

    colourChoices.appendChild(button);
  }

  addOutlineColourChoice("No colour", "", false);

  colorOptions.forEach(function (colour) {
    addOutlineColourChoice(
      colour.label + " (" + colour.value + ")",
      colour.value,
      false
    );
  });

  var colourDivider = document.createElement("div");
  colourDivider.className = "quick-colour-menu-divider";
  colourChoices.appendChild(colourDivider);

  addOutlineColourChoice("Add a colour…", null, true);

  colourDetails.appendChild(colourChoices);
  menu.appendChild(colourDetails);



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
  var layout = document.querySelector("main");
  if (!panel || !btn || !layout) return;

  controlsVisible = !controlsVisible;
  panel.style.display = controlsVisible ? "" : "none";
  layout.classList.toggle("sidebar-collapsed", !controlsVisible);

  var label = controlsVisible ? "Hide editing panel" : "Show editing panel";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.setAttribute("aria-expanded", controlsVisible ? "true" : "false");

  // The icon stays in the sidebar dock, even when the panel is hidden.
  // CSS handles full-width and narrow-screen layouts.
  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(updateAllViews);
  } else {
    updateAllViews();
  }
}


/* Export chart: vector PDF / SVG / PNG implemented below in this file.
   No html2canvas or jsPDF pipeline is used. */

function updateLegendVisibility() {
  var legend = document.getElementById("legendContainer");
  var btn = document.getElementById("toggleLegendBtn");
  if (!legend || !btn) return;

  legend.style.display = legendVisible ? "block" : "none";
  var label = legendVisible ? "Hide key" : "Show key";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", legendVisible ? "true" : "false");
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

  dismissInlineColourMenu();

  var menu = document.createElement("div");
  menu.className = "diagram-inline-colour-menu";
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", "Change box colour");

  var node = nodes.find(function (n) { return n.id === nodeId; });
  var currentColour = Object.prototype.hasOwnProperty.call(
    activeDiagramTextEdit, "pendingColour"
  ) ? activeDiagramTextEdit.pendingColour : (node ? node.color : "");
  currentColour = (currentColour || "").toLowerCase();

  function closeMenu() {
    menu.remove();
    document.removeEventListener("pointerdown", outsideClick, true);
    document.removeEventListener("keydown", escapeKey, true);
    window.removeEventListener("resize", closeMenu);
    window.removeEventListener("scroll", scrollOutside, true);
    if (closeInlineColourMenu === closeMenu) closeInlineColourMenu = null;
  }

  function outsideClick(event) {
    if (!menu.contains(event.target) && !trigger.contains(event.target)) {
      closeMenu();
    }
  }

  function scrollOutside(event) {
    if (!menu.contains(event.target)) closeMenu();
  }

  function escapeKey(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    if (trigger.isConnected) trigger.focus();
  }

  function addChoice(label, colour, action) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "diagram-inline-colour-choice";

    if (colour !== null) {
      button.setAttribute("aria-pressed",
        String((colour || "").toLowerCase() === currentColour));
    }

    if (colour) {
      var swatch = document.createElement("span");
      swatch.className = "diagram-inline-colour-swatch";
      swatch.style.backgroundColor = colour;
      button.appendChild(swatch);
    }

    var text = document.createElement("span");
    text.textContent = label;
    text.style.minWidth = "0";
    text.style.overflowWrap = "anywhere";
    button.appendChild(text);

    if (colour !== null && (colour || "").toLowerCase() === currentColour) {
      var tick = document.createElement("span");
      tick.textContent = "✓";
      tick.style.marginLeft = "auto";
      tick.setAttribute("aria-hidden", "true");
      button.appendChild(tick);
    }

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      action();
      if (colour !== null && trigger.isConnected) trigger.focus();
    });
    menu.appendChild(button);
  }

  // Remove the element's colour.
  addChoice("No colour", "", function () {
    previewInlineColour(nodeId, "", null);
  });

  // Show only colours already saved in the key.
  if (!colorOptions.length) {
    var empty = document.createElement("div");
    empty.className = "colour-options-empty";
    empty.textContent = "No colours added yet.";
    menu.appendChild(empty);
  } else {
    colorOptions.forEach(function (option) {
      addChoice(option.label + " (" + option.value + ")", option.value,
        function () { previewInlineColour(nodeId, option.value, null); });
    });
  }

  // Separate existing colours from the Add colour action.
  var divider = document.createElement("div");
  divider.className = "quick-colour-menu-divider";
  menu.appendChild(divider);

  // Open the existing shared 24-colour popup.
  addChoice("Add a colour…", null, function () {
    openQuickColourDialogForNode(nodeId);
  });

  // Position the menu near the palette button.
  document.body.appendChild(menu);
  var rect = trigger.getBoundingClientRect();
  var left = Math.max(8,
    Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8));
  var top = rect.bottom + 6;

  if (top + menu.offsetHeight > window.innerHeight - 8) {
    top = Math.max(8, rect.top - menu.offsetHeight - 6);
  }

  menu.style.left = left + "px";
  menu.style.top = top + "px";

  // Close on outside click, Escape, resize or external scroll.
  closeInlineColourMenu = closeMenu;
  document.addEventListener("pointerdown", outsideClick, true);
  document.addEventListener("keydown", escapeKey, true);
  window.addEventListener("resize", closeMenu);
  window.addEventListener("scroll", scrollOutside, true);
}

/* B5.5b — 24 standard colours for the visual element picker. */
var standardDiagramColours = [
  { label: "NHS Dark Blue", value: "#003087" },
  { label: "NHS Blue", value: "#005EB8" },
  { label: "NHS Aqua Green", value: "#00A499" },
  { label: "NHS Purple", value: "#330072" },
  { label: "NHS Pink", value: "#AE2573" },
  { label: "NHS Dark Grey", value: "#425563" },

  { label: "NHS Bright Blue", value: "#0072CE" },
  { label: "NHS Light Blue", value: "#41B6E6" },
  { label: "NHS Green", value: "#009639" },
  { label: "NHS Orange", value: "#ED8B00" },
  { label: "NHS Warm Yellow", value: "#FFB81C" },
  { label: "NHS Mid Grey", value: "#768692" },

  { label: "Soft Pink", value: "#FBDADA" },
  { label: "Soft Orange", value: "#FFD285" },
  { label: "Soft Yellow", value: "#FFFB8F" },
  { label: "Soft Green", value: "#A6FF94" },
  { label: "Soft Blue", value: "#D9E8F5" },
  { label: "Soft Aqua", value: "#D9F1EF" },

  { label: "White", value: "#FFFFFF" },
  { label: "Off White", value: "#F8F9FA" },
  { label: "Cool Slate", value: "#F0F4F5" },
  { label: "NHS Pale Grey", value: "#E8EDEE" },
  { label: "Soft Grey", value: "#AEB7BD" },
  { label: "NHS Charcoal", value: "#212B32" }
];





/* Unified popup for adding, applying and editing named colours. */
function openQuickColourDialogForNode(nodeId, options) {
  options = options || {};
  var fromSidebar = nodeId == null;
  var editOption = options.editValue
    ? findColorOptionByValue(options.editValue) : null;
  var editingExisting = !!editOption;
  var originalValue = editingExisting ? editOption.value : null;
  var originalLabel = editingExisting ? editOption.label : null;

  var targetNode = fromSidebar ? null : nodes.find(function (n) {
    return n.id === nodeId;
  });
  if ((!fromSidebar && !targetNode) ||
      document.getElementById("quickColourDialog")) return;

  var dialog = document.createElement("dialog");
  dialog.id = "quickColourDialog";
  dialog.className = "quick-colour-dialog";
  dialog.setAttribute("aria-labelledby", "quickColourTitle");

  dialog.innerHTML =
    '<form id="quickColourForm" novalidate>' +
      '<div class="quick-colour-header">' +
        '<h2 id="quickColourTitle">Add a colour</h2>' +
        '<button type="button" id="quickColourClose" class="quick-colour-close" ' +
          'aria-label="Close colour picker">×</button>' +
      '</div>' +
      '<p id="quickColourTarget" class="quick-colour-target" hidden></p>' +
      '<label class="quick-colour-field-label" id="quickColourGridLabel">Choose a colour</label>' +
      '<div id="quickColourGrid" class="quick-colour-grid" ' +
        'role="group" aria-labelledby="quickColourGridLabel"></div>' +
      '<div class="quick-colour-selection-row">' +
        '<details class="quick-colour-custom" id="quickColourCustom">' +
          '<summary>Custom colour…</summary>' +
          '<label for="quickColourValue">Choose your own colour</label>' +
          '<input id="quickColourValue" type="color">' +
        '</details>' +
        '<span class="quick-colour-current">' +
          '<span id="quickColourPreview" class="quick-colour-preview"></span>' +
          '<span id="quickColourSelected">Select a colour</span>' +
        '</span>' +
      '</div>' +
      '<label for="quickColourName" class="quick-colour-field-label">Colour name</label>' +
      '<input id="quickColourName" type="text" maxlength="80" ' +
        'placeholder="e.g. Workforce workstream" autocomplete="off" required>' +
      '<p id="quickColourError" class="quick-colour-error" role="alert"></p>' +
      '<div class="quick-colour-actions">' +
        '<button type="button" class="secondary quick-colour-remove" ' +
          'id="quickColourRemove" hidden>Remove colour</button>' +
        '<button type="button" class="secondary" ' +
          'id="quickColourCancel">Cancel</button>' +
        '<button type="submit" id="quickColourSave" disabled>Add colour</button>' +
      '</div>' +
    '</form>';

  var grid = dialog.querySelector("#quickColourGrid");
  var nameInput = dialog.querySelector("#quickColourName");
  var colourInput = dialog.querySelector("#quickColourValue");
  var errorText = dialog.querySelector("#quickColourError");
  var selectedText = dialog.querySelector("#quickColourSelected");
  var preview = dialog.querySelector("#quickColourPreview");
  var saveButton = dialog.querySelector("#quickColourSave");
  var removeButton = dialog.querySelector("#quickColourRemove");
  var selectedColour = editingExisting ? editOption.value.toLowerCase() : null;

  if (editingExisting) {
    dialog.querySelector("#quickColourTitle").textContent = "Edit colour";
    saveButton.textContent = "Save changes";
    nameInput.value = editOption.label;
  } else if (!fromSidebar) {
    // Show the current box colour (or an unsaved inline preview), if present.
    var current = targetNode.color || "";
    if (activeDiagramTextEdit && activeDiagramTextEdit.id === nodeId &&
        Object.prototype.hasOwnProperty.call(activeDiagramTextEdit, "pendingColour")) {
      current = activeDiagramTextEdit.pendingColour || "";
    }
    selectedColour = current ? current.toLowerCase() : null;
    var known = findColorOptionByValue(selectedColour);
    if (known) nameInput.value = known.label;
    removeButton.hidden = false;
    var target = dialog.querySelector("#quickColourTarget");
    target.hidden = false;
    target.textContent = "Box: " + targetNode.text;
  }

  function refreshSelection() {
    var isValid = selectedColour && /^#[0-9a-f]{6}$/.test(selectedColour);
    if (isValid) {
      colourInput.value = selectedColour;
      preview.style.backgroundColor = selectedColour;
      selectedText.textContent = selectedColour.toUpperCase();
    } else {
      preview.style.backgroundColor = "#ffffff";
      selectedText.textContent = "Select a colour";
    }

    grid.querySelectorAll(".quick-colour-tile").forEach(function (tile) {
      tile.setAttribute("aria-pressed",
        tile.dataset.colour.toLowerCase() === selectedColour ? "true" : "false");
    });

    var name = nameInput.value.trim();
    var unchanged = editingExisting &&
      selectedColour === originalValue.toLowerCase() &&
      name === originalLabel;
    saveButton.disabled = !isValid || !name || unchanged;
    errorText.textContent = "";
  }

  function chooseColour(value, preserveName) {
    selectedColour = String(value || "").toLowerCase();
    if (!editingExisting && !preserveName) {
      var matching = findColorOptionByValue(selectedColour);
      nameInput.value = matching ? matching.label : "";
    }
    refreshSelection();
  }

  standardDiagramColours.forEach(function (preset) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "quick-colour-tile";
    button.dataset.colour = preset.value;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", preset.label + ", " + preset.value);
    button.title = preset.value + " (" + preset.label + ")";

    var swatch = document.createElement("span");
    swatch.className = "quick-colour-tile-swatch";
    swatch.style.backgroundColor = preset.value;
    swatch.setAttribute("aria-hidden", "true");
    button.appendChild(swatch);

    button.addEventListener("click", function () {
      chooseColour(preset.value, false);
      nameInput.focus();
    });
    grid.appendChild(button);
  });

  // Browser-native custom colour picker; the name field stays visible.
  colourInput.value = selectedColour || defaultNewColorValue;
  colourInput.addEventListener("input", function () {
    chooseColour(colourInput.value, true);
  });
  colourInput.addEventListener("change", function () {
    chooseColour(colourInput.value, true);
  });
  nameInput.addEventListener("input", refreshSelection);

  function closeDialog() { dialog.close(); }
  dialog.querySelector("#quickColourCancel").addEventListener("click", closeDialog);
  dialog.querySelector("#quickColourClose").addEventListener("click", closeDialog);

  removeButton.addEventListener("click", function () {
    if (fromSidebar) return;
    if (activeDiagramTextEdit && activeDiagramTextEdit.id === nodeId) {
      previewInlineColour(nodeId, "", null);
    } else {
      var node = nodes.find(function (n) { return n.id === nodeId; });
      if (node) {
        node.color = "";
        updateAllViews();
      }
    }
    closeDialog();
  });

  dialog.querySelector("#quickColourForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var colour = (selectedColour || "").toLowerCase();
    var label = nameInput.value.trim();
    if (!/^#[0-9a-f]{6}$/.test(colour)) {
      errorText.textContent = "Choose a colour first.";
      return;
    }
    if (!label) {
      errorText.textContent = "Enter a name for the colour.";
      nameInput.focus();
      return;
    }

    var matching = findColorOptionByValue(colour);
    if (editingExisting) {
      if (matching && matching !== editOption) {
        errorText.textContent = 'Already saved as "' + matching.label +
          '". Choose a different colour.';
        return;
      }
      // A renamed or recoloured key entry updates every box that uses it.
      editOption.label = label;
      editOption.value = colour;
      nodes.forEach(function (node) {
        if ((node.color || "").toLowerCase() === originalValue.toLowerCase()) {
          node.color = colour;
        }
      });
      if (activeDiagramTextEdit &&
          (activeDiagramTextEdit.pendingColour || "").toLowerCase() ===
            originalValue.toLowerCase()) {
        activeDiagramTextEdit.pendingColour = colour;
      }
      updateAllViews();
      setColorEditorStatus('Colour "' + label + '" updated.', "success");
    } else {
      var currentNode = fromSidebar ? null : nodes.find(function (n) {
        return n.id === nodeId;
      });
      if (!fromSidebar && !currentNode) {
        errorText.textContent = "This element is no longer available.";
        return;
      }

      // An existing hex value reuses its single named key entry.
      var optionToCommit = matching && matching.label === label
        ? null : { label: label, value: colour };

      if (!fromSidebar && activeDiagramTextEdit &&
          activeDiagramTextEdit.id === nodeId) {
        // Commit the colour and its name only when the box's tick is clicked.
        previewInlineColour(nodeId, colour, optionToCommit);
      } else {
        if (matching) {
          matching.label = label;
        } else {
          colorOptions.push({ label: label, value: colour });
        }
        if (currentNode) currentNode.color = colour;
        updateAllViews();
        setColorEditorStatus('Colour "' + label + '" added.', "success");
      }
    }
    closeDialog();
  });

  dialog.addEventListener("close", function () {
    dialog.remove();
    if (activeDiagramTextEdit && activeDiagramTextEdit.id === nodeId) {
      var field = document.getElementById("diagramInlineText");
      if (field) field.focus();
    }
  });

  document.body.appendChild(dialog);
  refreshSelection();
  dialog.showModal();
  if (editingExisting) nameInput.focus();
  else {
    var first = grid.querySelector("button");
    if (first) first.focus();
  }
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

      addSubItem("Add a colour…", function () {
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

    "4. Invite me to review, correct and refine the wording, relationships and scope. Do not treat a plausible diagram as an agreed improvement plan. At the END of every draft or revised draft, ask: 'Would you like to refine the diagram further, or generate an importable CSV from the current draft?' Then STOP and wait for my choice.",
    "5. If I choose to generate/export CSV, or say 'Generate the CSV now' or equivalent, treat that as my explicit request. Immediately output the CSV in your NEXT response using the contract below. Do not reopen general discussion or ask another review question, unless one essential detail would make the CSV invalid. If I choose refinement, help revise and then offer the same two choices again.",
    "",
    "CONTENT PREFERENCES",
    "Wording: " + (wording[options.wording] || wording.preserve),
    "Measures: " + (measures[options.measures] || measures.none),
    "Change ideas: " + (changes[options.changes] || changes.existing),
    "Colour formatting: " + (colours[options.colours] || colours.app),
    "Keep the number of drivers and changes manageable. Avoid bland or generic management language. A polished-looking diagram is not evidence of validity.",
    "",
    "CSV OUTPUT CONTRACT (ONLY WHEN I REQUEST CSV)",
        "Return only one fenced csv code block.",
    "By default, use exactly these four required columns, in this order:",
    "id,level,parent_id,text",
    "Only if colours, additional parent connections or measures are requested, use these seven columns instead:",
    "id,level,parent_id,text,color,extra_parents,measures_json",
    "Use exactly one aim row with a blank parent_id. Valid levels are aim, primary, secondary and change. Give each row a unique sequential numeric ID starting at 1. Each primary has the Aim as parent, each secondary has a primary as parent and each change has a secondary as parent.",
    "Maintain the reviewed ordering and wording. No self-connections, missing parents or cycles. Use extra_parents only for genuine additional connections we have explicitly agreed; use semicolon-separated IDs.",
    "CSV formatting is essential. Put double quotes around EVERY text field, even when it contains no commas. If the text contains quotation marks, escape them by doubling them. Never leave a comma inside an unquoted text field.",
    "Every data row must contain exactly the same number of columns as the header: four for the basic format, or seven for the extended format. In the seven-column format, if all three optional fields are blank, include three trailing commas after the text field.",
    "If measures are requested, encode measures_json as a JSON array of objects containing type and text. Permitted types: outcome, process, balancing and none. Escape JSON quotation marks correctly within CSV fields.",    "Do not include auto_size: the app enables automatic sizing by default. Do not introduce extra columns. Check the CSV against these rules before sending it.",
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
  var copyFeedback = document.getElementById("aiCopyFeedback");

  if (!editor || !makeButton || !resetButton ||
      !copyButton || !status || !copyFeedback) return;
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

  
  // Display a visible confirmation beside Copy prompt.
  var copyFeedbackTimer = null;

  function reportCopy(success) {
    if (copyFeedbackTimer) {
      window.clearTimeout(copyFeedbackTimer);
    }

    copyFeedback.textContent = success
      ? "✓ Copied to clipboard"
      : "Copy blocked — select the text and copy manually";

    copyFeedback.classList.toggle("is-error", !success);
    copyFeedback.hidden = false;

    status.textContent = success
      ? "Prompt copied. Paste it only into an AI service authorised for your task and information."
      : "Automatic copying was blocked. Select all the prompt text and copy it manually.";

    copyFeedbackTimer = window.setTimeout(function () {
      copyFeedback.hidden = true;
      copyFeedback.textContent = "";
    }, 5000);
  }

  function fallbackCopy() {
    editor.focus();
    editor.select();

    var success = false;

    try {
      success = document.execCommand("copy");
    } catch (error) {
      success = false;
    }

    reportCopy(success);
  }

  copyButton.addEventListener("click", function () {
    if (!editor.value.trim()) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(editor.value).then(function () {
        reportCopy(true);
      }).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
 
  });

  // B5.3d.1 — Reset the AI wizard whenever its window closes.
  var aiDialog = document.getElementById("aiGuidanceDialog");

  if (aiDialog) {
    aiDialog.addEventListener("close", function () {

      // Restore all recommended preferences.
      Object.keys(fields).forEach(function (key) {
        fields[key].selectedIndex = 0;
      });

      // Clear the generated or edited prompt.
      editor.value = "";
      lastGenerated = "";
      status.textContent = "";

      // Clear any copy notification and its timer.
      if (copyFeedbackTimer) {
        window.clearTimeout(copyFeedbackTimer);
        copyFeedbackTimer = null;
      }

      copyFeedback.hidden = true;
      copyFeedback.textContent = "";
      copyFeedback.classList.remove("is-error");

      // Clear any pasted CSV and import messages.
      var csvField = document.getElementById("aiCsvPasteInput");
      var csvStatus = document.getElementById("aiCsvPasteStatus");

      if (csvField) csvField.value = "";
      if (csvStatus) csvStatus.textContent = "";

      // Expand the IG warning again.
      var warning = aiDialog.querySelector(".ai-ig-warning");
      if (warning) warning.open = true;

      // Collapse the explanatory scenario sections.
      aiDialog.querySelectorAll(".ai-scenario").forEach(function (item) {
        item.open = false;
      });

      // Start at the top of the window next time.
      aiDialog.scrollTop = 0;

      // Update the Copy and Restore button states.
      setButtons();
    });
  }

  setButtons();
}


/* B5.3c — Import CSV pasted from an AI chatbot. */

function initialiseAiCsvPaste() {
  var field = document.getElementById("aiCsvPasteInput");
  var importButton = document.getElementById("aiImportPastedCsv");
  var clearButton = document.getElementById("aiClearPastedCsv");
  var status = document.getElementById("aiCsvPasteStatus");
  var dialog = document.getElementById("aiGuidanceDialog");

  if (!field || !importButton || !clearButton || !status) {
    return;
  }

  // Clear pasted text without affecting the current diagram.
  clearButton.addEventListener("click", function () {
    field.value = "";
    status.textContent = "CSV text cleared.";
    field.focus();
  });

  importButton.addEventListener("click", function () {
    var text = field.value.trim();

    if (!text) {
      status.textContent = "Paste the CSV from your chatbot first.";
      field.focus();
      return;
    }

    // Do not replace the diagram during an unfinished text edit.
    if (activeDiagramTextEdit || activeOutlineTextEdit) {
      status.textContent =
        "Save or cancel your current diagram text edit before importing.";
      return;
    }

    // Accept plain CSV or a fenced ```csv block.
    var match = text.match(/```csv[ \t]*\r?\n([\s\S]*?)\r?\n```/i);

    if (match) {
      text = match[1].trim();
    }

    if (!text) {
      status.textContent = "No CSV rows were found in the pasted text.";
      return;
    }

    // Reuse the existing CSV validation and import process.
    var file = new File(
      [text],
      "pasted-driver-diagram.csv",
      { type: "text/csv" }
    );

    status.textContent = "Checking pasted CSV...";
    importButton.disabled = true;

    uploadCsv(file, function (ok) {
      importButton.disabled = false;

      if (!ok) {
        status.textContent =
          "CSV was not imported. The existing diagram is unchanged.";
        return;
      }

      // Clear successful imports from the temporary paste area.
      field.value = "";
      status.textContent = "CSV imported successfully.";

      // Close the AI window to reveal the imported diagram.
      if (dialog && dialog.open) {
        dialog.close();
      }
    });
  });
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
  var btnToggleControls = document.getElementById("btnToggleControls");
  var btnHeaderClear = document.getElementById("btnHeaderClear");
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
  initialiseAiCsvPaste();

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
  
  if (btnToggleControls) {
    btnToggleControls.addEventListener("click", toggleControlsVisibility);
  }
  
  if (btnHeaderClear) {
    btnHeaderClear.addEventListener("click", clearAllNodes);
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

/* ---------- Reliable vector export subsystem ---------- */

/*
 * Driver Diagram Tool — production vector exports (PDF, SVG and PNG)
 * Standalone browser implementation; included automatically in saved HTML.
 * Based on validated P0 Phase 3.2 exporter with A3/A2/A1 print options.
 */
(function () {
  "use strict";
  var SVG_NS = "http://www.w3.org/2000/svg";

  function notify(message) {
    window.alert(message);
  }

  function editingBlocked(action) {
    if (typeof window.blockFileActionDuringEdit === "function") {
      return window.blockFileActionDuringEdit(action);
    }
    if (window.activeDiagramTextEdit || window.activeOutlineTextEdit) {
      notify("Save or cancel your current edit before " + action + ".");
      return true;
    }
    return false;
  }

  function afterTwoFrames(callback) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(callback);
    });
  }

  function getReadyDiagram(callback) {
    // Exporting from Outline should not unexpectedly leave the user in Diagram.
    var restoreOutline = window.diagramViewMode === "outline" &&
      typeof window.switchDiagramView === "function";
    if (restoreOutline) window.switchDiagramView("diagram");
    afterTwoFrames(function () {
      var area = document.getElementById("exportArea");
      var canvas = document.getElementById("diagramCanvas");
      var connections = document.getElementById("diagramConnections");
      try {
        if (!area || !canvas || !connections || !area.getBoundingClientRect().width) {
          throw new Error("The diagram could not be located for this export test.");
        }
        callback(area, canvas, connections);
      } finally {
        if (restoreOutline) window.switchDiagramView("outline");
      }
    });
  }

  // Full content bounds, including wide canvases on mobile and measures below
  // absolutely positioned boxes. A simple getBoundingClientRect() can undercount.
  function getExportBounds(area) {
    var outer = area.getBoundingClientRect();
    var canvas = area.querySelector("#diagramCanvas");
    var width = Math.max(outer.width, area.scrollWidth,
      canvas ? canvas.scrollWidth : 0);
    var height = Math.max(outer.height, area.scrollHeight);
    area.querySelectorAll(
      ".diagram-item, .diagram-measure-row, .diagram-column-title, #legendContainer"
    ).forEach(function (el) {
      if (el.closest("#legendContainer") &&
          getComputedStyle(el.closest("#legendContainer")).display === "none") return;
      var b = el.getBoundingClientRect();
      if (b.width && b.height) {
        width = Math.max(width, b.right - outer.left + 3);
        height = Math.max(height, b.bottom - outer.top + 3);
      }
    });
    return {rect:outer,width:Math.ceil(width),height:Math.ceil(height)};
  }

  function copyStylesForPrint() {
    var base = document.createElement("base");
    base.href = document.baseURI;
    var styles = Array.from(document.head.querySelectorAll(
      'style, link[rel="stylesheet"]'
    )).map(function (el) { return el.outerHTML; }).join("\n");
    return base.outerHTML + "\n" + styles;
  }

  function cleanCloneForPrint(area) {
    var clone = area.cloneNode(true);
    clone.classList.add("export-clean");
    clone.removeAttribute("hidden");
    clone.querySelectorAll(".diagram-connection-hit").forEach(function (el) {
      el.remove();
    });
    clone.querySelectorAll(".diagram-connection-visible").forEach(function (path) {
      path.setAttribute("stroke", "#666");
      path.setAttribute("stroke-width", "2.5");
      path.removeAttribute("data-selected");
    });
    // Keep only the static, user-visible export area; don't run application JS.
    return clone;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>\"']/g, function (m) {
      return {"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[m];
    });
  }

  // Physical ISO A-series landscape paper dimensions, in millimetres.
  // Preserve print-area margins for bleed-safe professional copies.
  var PAPER_SIZES = {
    A3: {width:420, height:297},
    A2: {width:594, height:420},
    A1: {width:841, height:594}
  };
  var PRINT_MARGIN_MM = 5;
  // 7 pt is a diagnostic minimum, not an accessibility conformance claim.
  var MIN_MEASURE_PT = 7;

  function getPdfFit(size, widthPx, heightPx, measurePx) {
    var sheet = PAPER_SIZES[size];
    var fitWidth = (sheet.width - PRINT_MARGIN_MM*2) * 96 / 25.4;
    var fitHeight = (sheet.height - PRINT_MARGIN_MM*2) * 96 / 25.4;
    var scale = Math.min(fitWidth/widthPx, fitHeight/heightPx);
    return {
      scale:scale,
      shownWidth:Math.ceil(widthPx*scale),
      shownHeight:Math.ceil(heightPx*scale),
      measurePt:measurePx*scale*0.75
    };
  }

  function printPreview() {
    if (editingBlocked("preparing the vector PDF")) return;

    // Open synchronously, before requestAnimationFrame, to avoid popup blockers.
    var preview = window.open("", "_blank", "width=1100,height=850");
    if (!preview) {
      notify("Please allow pop-ups for this tool, then try 'Test vector PDF' again.");
      return;
    }
    preview.document.write("<!doctype html><title>Preparing driver diagram…</title><p>Preparing print preview…</p>");
    preview.document.close();

    getReadyDiagram(function (area) {
      if (preview.closed) return;
      try {
        var full = getExportBounds(area);
        var fullWidth = full.width;
        var fullHeight = full.height;
        var colElement = area.querySelector("#diagramColumns");
        var liveColumnGap = colElement ? getComputedStyle(colElement).columnGap : "3.5rem";

        // Use smallest actually rendered measure font rather than just the first.
        var measureSizes = Array.from(area.querySelectorAll(
          ".diagram-measure-row > span:last-child"
        )).map(function (el) {
          return parseFloat(window.getComputedStyle(el).fontSize);
        }).filter(function (n) { return Number.isFinite(n) && n>0; });
        var measurePx = measureSizes.length ? Math.min.apply(null,measureSizes) : 10;
        var fit = {};
        Object.keys(PAPER_SIZES).forEach(function (size) {
          fit[size] = getPdfFit(size,fullWidth,fullHeight,measurePx);
        });
        var recommended = Object.keys(PAPER_SIZES).find(function (size) {
          return fit[size].measurePt >= MIN_MEASURE_PT;
        }) || "A1";
        var noSizeMeetsTarget = fit.A1.measurePt < MIN_MEASURE_PT;
        var clone = cleanCloneForPrint(area);
        clone.style.setProperty("width",fullWidth+"px","important");
        clone.style.setProperty("max-width","none","important");

        var css = [
          "* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }",
          "html,body { margin:0 !important; padding:0 !important; background:#fff !important; }",
          "#p0-actions { box-sizing:border-box; display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:10px; font:14px sans-serif; background:#f1f5f9; color:#1e293b; }",
          "#p0-actions button,#p0-actions select { font:inherit; border:1px solid #94a3b8; background:white; color:#111; padding:6px 10px; cursor:pointer; border-radius:5px; }",
          "#p0-actions label { display:inline-flex; align-items:center; gap:7px; font-size:13px; margin:0; }",
          "#p0-actions select { width:auto !important; margin:0 !important; }",
          "#p0-actions p { margin:0; flex:1 1 100%; font-size:12px; line-height:1.4; }",
          "#p0-actions p.p0-warning { color:#992116; font-weight:650; }",
          "#p0-actions p.p0-good { color:#14532d; }",
          "#p0-page { position:relative; width:"+fit.A3.shownWidth+"px; height:"+fit.A3.shownHeight+"px; margin:8px auto; overflow:visible; }",
          "#exportArea { position:absolute !important; top:0; left:0; box-sizing:border-box; width:"+fullWidth+"px !important; max-width:none !important; zoom:"+fit.A3.scale.toFixed(8)+"; transform:none !important; }",
          "#exportArea #diagramCanvasWrapper { overflow:visible !important; }",
          "#exportArea #diagramColumns { column-gap:"+liveColumnGap+" !important; }",
          "#exportArea .diagram-add,#exportArea .diagram-quick-add-measure,#exportArea .diagram-edit-pencil,#exportArea .diagram-delete-button,#exportArea .diagram-color-badge,#exportArea .diagram-inline-actions { display:none !important; }",
          "#exportArea .diagram-node.diagram-selected { outline:none !important; }",
          "#exportArea .diagram-measure-row { outline:none !important; background:transparent !important; box-shadow:none !important; }",
          "#exportArea .diagram-connection-hit { display:none !important; }",
          "@media print { #p0-actions { display:none !important; } #p0-page { margin:0 auto !important; break-inside:avoid !important; page-break-inside:avoid !important; } }"
        ].join("\n");

        // Only these dimensions and the legibility estimate cross into the
        // isolated print window. No editor controls or event handlers travel.
        var opts = {
          fits:fit,
          sheets:PAPER_SIZES,
          recommended:recommended,
          noSizeMeetsTarget:noSizeMeetsTarget,
          minimumPt:MIN_MEASURE_PT
        };
        var run = [
          '(function(){',
          '"use strict";',
          'var sizes='+JSON.stringify(opts)+';',
          'window.p0ChoosePaper=function(size){',
          'if(!sizes.fits[size]) return;',
          'var f=sizes.fits[size];',
          'var paper=sizes.sheets[size];',
          'document.getElementById("p0-page-size").textContent="@page { size: "+paper.width+"mm "+paper.height+"mm; margin: 5mm; }";',
          'document.getElementById("p0-paper").value=size;',
          'document.getElementById("p0-page").style.width=f.shownWidth+"px";',
          'document.getElementById("p0-page").style.height=f.shownHeight+"px";',
          'document.getElementById("exportArea").style.setProperty("zoom",f.scale.toFixed(8),"important");',
          'var info=document.getElementById("p0-print-quality");',
          'var pt=f.measurePt.toFixed(2);',
          'if(f.measurePt<sizes.minimumPt){',
          'info.className="p0-warning";',
          'info.textContent="READABILITY WARNING: estimated smallest measure text is "+pt+" pt on "+size+" landscape (below the "+sizes.minimumPt+" pt test threshold). "+',
          '(sizes.noSizeMeetsTarget?"Even A1 is too small; reduce content or change layout.":"Recommended: "+sizes.recommended+" landscape.");',
          '}else{',
          'info.className="p0-good";',
          'info.textContent="Estimated smallest measure text: "+pt+" pt on "+size+" landscape. Review the actual PDF at 100% before sharing.";',
          '}',
          'document.getElementById("p0-print-paper").textContent="Print / Save as PDF ("+size+")";',
          '};',
          'window.p0ChoosePaper("A3");',
          '})();'
        ].join("\n");
        var recommendation = recommended !== "A3"
          ? '<button type="button" id="p0-recommended" onclick="window.p0ChoosePaper(\''+recommended+'\')">Use recommended '+recommended+'</button>'
          : "";
        var markup = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Driver diagram — vector PDF</title>'+
          copyStylesForPrint()+'<style>'+css+'</style>'+
          '<style id="p0-page-size">@page { size:420mm 297mm; margin:5mm; }</style></head><body>'+
          '<div id="p0-actions"><button id="p0-print-paper" type="button" onclick="window.print()">Print / Save as PDF (A3)</button>'+
          '<label for="p0-paper">Paper size <select id="p0-paper" onchange="window.p0ChoosePaper(this.value)"><option value="A3">A3 landscape</option><option value="A2">A2 landscape</option><option value="A1">A1 landscape</option></select></label>'+
          recommendation+
          '<button type="button" onclick="window.close()">Close</button>'+
          '<p id="p0-print-quality" role="status" aria-live="polite"></p></div>'+
          '<div id="p0-page">'+clone.outerHTML+'</div>'+
          '<script>'+run+'<\/script></body></html>';
        preview.document.open();
        preview.document.write(markup);
        preview.document.close();
      } catch (error) {
        console.error("P0 print preview error",error);
        try { preview.close(); } catch (ignore) {}
        notify("Could not prepare the vector PDF: " + error.message);
      }
    });
  }

  function svgElement(tag, attributes) {
    var result = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes || {}).forEach(function (key) {
      if (attributes[key] != null) result.setAttribute(key, String(attributes[key]));
    });
    return result;
  }

  function svgRect(group, x, y, w, h, attrs) {
    var shape = svgElement("rect", Object.assign({x:x,y:y,width:w,height:h}, attrs));
    group.appendChild(shape);
    return shape;
  }

  function exportSvgDiagram(area, canvas, connections) {
    var full = getExportBounds(area);
    var base = full.rect;
    var width = full.width;
    var height = full.height;
    var root = svgElement("svg", {
      xmlns: SVG_NS, version:"1.1", viewBox:"0 0 " + width + " " + height,
      width:width, height:height, role:"img",
      "aria-label":"Driver diagram with measures and legend"
    });
    root.appendChild(svgElement("title")).textContent = "Driver Diagram — vector export";
    svgRect(root,0,0,width,height,{fill:"#ffffff"});
    var position = function (rect) {
      return { x:rect.left-base.left, y:rect.top-base.top,
        width:rect.width,height:rect.height };
    };
    var diagramShell = document.getElementById("diagramCanvasWrapper");
    if (diagramShell) {
      var shell = position(diagramShell.getBoundingClientRect());
      svgRect(root,shell.x,shell.y,shell.width,shell.height,{
        fill:"#fafafa", stroke:"#e0e0e0","stroke-width":1,rx:6
      });
    }
    // Import only visible vector connection paths, using the original geometry.
    var canvasRect = canvas.getBoundingClientRect();
    var linesGroup = svgElement("g", {
      transform:"translate(" + (canvasRect.left-base.left) + " " +
        (canvasRect.top-base.top) + ")"
    });
    connections.querySelectorAll(".diagram-connection-visible").forEach(function (path) {
      linesGroup.appendChild(svgElement("path", {
        d:path.getAttribute("d"), fill:"none", stroke:"#666",
        "stroke-width":2.5, "stroke-linecap":"round"
      }));
    });
    root.appendChild(linesGroup);

    // Use *browser-rendered word positions* to preserve spaces and line breaks
    // without html2canvas. Every word is individually positioned in native SVG.
    function appendSvgText(element) {
      if (!element || !element.getClientRects().length) return;
      var style = window.getComputedStyle(element);
      var group = svgElement("g", {"aria-label":element.textContent || ""});
      var fontAttrs = {
        fill:style.color, "font-family":style.fontFamily,
        "font-size":style.fontSize, "font-weight":style.fontWeight,
        "font-style":style.fontStyle,
        "dominant-baseline":"text-before-edge"
      };
      var range = document.createRange();
      var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      var textNode, runs = [];
      function addRun(word, rect, separated) {
        if (!word || !rect || !rect.width || !rect.height) return;
        runs.push({word:word, x:rect.left-base.left,
          y:rect.top-base.top, separated:separated !== false});
      }
      while ((textNode = walker.nextNode())) {
        var value = textNode.nodeValue || "";
        var re = /\S+/gu, match;
        while ((match = re.exec(value))) {
          range.setStart(textNode,match.index);
          range.setEnd(textNode,match.index+match[0].length);
          var rects = range.getClientRects();
          if (rects.length === 1) {
            addRun(match[0],rects[0],true);
          } else if (rects.length > 1) {
            // Split only a genuinely wrapped long word into line fragments.
            var index = match.index, lineTop = null;
            var fragment = "", firstRect = null, firstFragment = true;
            for (var ch of match[0]) {
              range.setStart(textNode,index);
              index += ch.length;
              range.setEnd(textNode,index);
              var charRect = range.getBoundingClientRect();
              if (lineTop !== null && Math.abs(charRect.top-lineTop)>1.5) {
                addRun(fragment,firstRect,firstFragment);
                fragment="";
                firstFragment=false;
              }
              if (!fragment) firstRect=charRect;
              lineTop=charRect.top;
              fragment+=ch;
            }
            addRun(fragment,firstRect,firstFragment);
          }
        }
      }
      // Keep the browser's actual line-break positions, but combine words
      // on each line into ONE SVG text node. Individual word-positioned SVG
      // elements can lose visible spaces in independent SVG renderers.
      var lines=[];
      runs.forEach(function (run) {
        var line=lines.find(function (candidate) {
          return Math.abs(candidate.y-run.y)<1.5;
        });
        if (!line) {
          line={y:run.y, x:run.x, words:[]};
          lines.push(line);
        }
        line.words.push(run);
      });
      lines.forEach(function (line) {
        line.words.sort(function (a,b) { return a.x-b.x; });
        var content=line.words.map(function (run,index) {
          return (index && run.separated ? " " : "") + run.word;
        }).join("");
        if (style.textTransform === "uppercase") content=content.toUpperCase();
        else if (style.textTransform === "lowercase") content=content.toLowerCase();
        var text=svgElement("text",Object.assign({},fontAttrs,{
          x:line.words[0].x,y:line.y
        }));
        text.textContent=content;
        group.appendChild(text);
      });
      if (lines.length) root.appendChild(group);
    }
    // Headings.
    area.querySelectorAll(".diagram-column-title").forEach(appendSvgText);

    // Boxes (fill, border and native text).
    area.querySelectorAll(".diagram-node").forEach(function (el) {
      var p = position(el.getBoundingClientRect());
      var style = window.getComputedStyle(el);
      svgRect(root,p.x,p.y,p.width,p.height,{
        fill:style.backgroundColor, stroke:style.borderTopColor,
        "stroke-width":1, rx:4
      });
      svgRect(root,p.x,p.y,4,p.height,{fill:style.borderLeftColor});
      appendSvgText(el.querySelector(".diagram-node-text"));
    });
    // Measures: vector bullet + browser-positioned words.
    area.querySelectorAll(".diagram-measure-row").forEach(function (row) {
      var bullet = row.firstElementChild;
      var text = row.lastElementChild;
      if (bullet) {
        var br = position(bullet.getBoundingClientRect());
        var bc = window.getComputedStyle(bullet);
        root.appendChild(svgElement("circle",{
          cx:br.x+br.width/2,cy:br.y+br.height/2,r:Math.min(3.5,br.height*.29),
          fill:bc.color
        }));
      }
      if (text && text!==bullet) appendSvgText(text);
    });
    // Only include visible legend, consistent with Hide key.
    var legend = area.querySelector("#legendContainer");
    if (legend && window.getComputedStyle(legend).display!=="none") {
      legend.querySelectorAll(".legend-title").forEach(appendSvgText);
      legend.querySelectorAll(".legend-item").forEach(function (row) {
        var swatch = row.querySelector(".legend-color-swatch");
        var label = row.lastElementChild;
        if (swatch) {
          var sw = position(swatch.getBoundingClientRect());
          var sc = window.getComputedStyle(swatch);
          svgRect(root,sw.x,sw.y,sw.width,sw.height,{
            fill:sc.backgroundColor,stroke:sc.borderTopColor,
            "stroke-width":1,rx:3
          });
        }
        if (label && label!==swatch) appendSvgText(label);
      });
      var emptyLegend = legend.querySelector("#legendEmptyMessage");
      if (emptyLegend && window.getComputedStyle(emptyLegend).display!=="none") {
        appendSvgText(emptyLegend);
      }
    }
    return root;
  }

  function prepareSvg() {
    return new Promise(function (resolve,reject) {
      getReadyDiagram(function (area,canvas,connections) {
        try {resolve(exportSvgDiagram(area,canvas,connections));}
        catch (e) { reject(e); }
      });
    });
  }

  function saveSvg() {
    if (editingBlocked("exporting SVG")) return;
    prepareSvg().then(function (svg) {
      var content = new XMLSerializer().serializeToString(svg);
      var blob = new Blob([content], {type:"image/svg+xml;charset=utf-8"});
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href=url; a.download="driver-diagram.svg";
      document.body.appendChild(a);
      a.click(); a.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    }).catch(function (error) {
      console.error("P0 SVG export error",error);
      notify("The SVG could not be created: " + error.message);
    });
  }


  // Independent high-resolution PNG test; no html2canvas dependency.
  function saveVectorPng() {
    if (editingBlocked("exporting PNG")) return;
    prepareSvg().then(function (svg) {
      var content = new XMLSerializer().serializeToString(svg);
      var svgUrl = URL.createObjectURL(new Blob([content], {
        type:"image/svg+xml;charset=utf-8"
      }));
      return new Promise(function (resolve,reject) {
        var image = new Image();
        image.onload=function () {
          try {
            var width=Number(svg.getAttribute("width"));
            var height=Number(svg.getAttribute("height"));
            var scale=3;
            var surface=document.createElement("canvas");
            surface.width=Math.round(width*scale);
            surface.height=Math.round(height*scale);
            var ctx=surface.getContext("2d");
            if (!ctx) throw new Error("The browser could not create a PNG canvas.");
            ctx.fillStyle="#ffffff";
            ctx.fillRect(0,0,surface.width,surface.height);
            ctx.drawImage(image,0,0,surface.width,surface.height);
            surface.toBlob(function (blob) {
              if (blob) resolve(blob);
              else reject(new Error("PNG encoding failed."));
            },"image/png");
          } catch (error) { reject(error); }
          finally {URL.revokeObjectURL(svgUrl);}
        };
        image.onerror=function () {
          URL.revokeObjectURL(svgUrl);
          reject(new Error("The browser could not render the vector diagram."));
        };
        image.src=svgUrl;
      });
    }).then(function (blob) {
      var url=URL.createObjectURL(blob);
      var link=document.createElement("a");
      link.href=url;
      link.download="driver-diagram.png";
      document.body.appendChild(link);
      link.click();link.remove();
      window.setTimeout(function () {URL.revokeObjectURL(url);},30000);
    }).catch(function (error) {
      console.error("P0 vector PNG export error",error);
      notify("The experimental PNG export failed: " + error.message);
    });
  }

  function install() {
    var menu = document.getElementById("exportChartMenu");
    if (!menu) return;

    [
      ["btnExportVectorPdf", printPreview],
      ["btnExportVectorPng", saveVectorPng],
      ["btnExportVectorSvg", saveSvg]
    ].forEach(function (entry) {
      var button = document.getElementById(entry[0]);
      if (!button) return;
      button.addEventListener("click", function () {
        menu.open = false;
        entry[1]();
      });
    });

    // An open export menu should behave like a compact toolbar menu.
    document.addEventListener("pointerdown", function (event) {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    menu.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menu.open) {
        event.preventDefault();
        event.stopPropagation();
        menu.open = false;
        var summary = menu.querySelector("summary");
        if (summary) summary.focus();
      }
    });
  }

  // Public methods support a small export regression suite.
  window.driverExport = {
    printPreview:printPreview,
    prepareSvg:prepareSvg,
    saveVectorPng:saveVectorPng,
    saveSvg:saveSvg
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",install,{once:true});
  } else {
    install();
  }
})();

/* DRIVER DIAGRAM TOOL — AI GUIDANCE THREE-TAB UPGRADE v1.3
 * Appendix for the existing driver.js. No AI API, new library or backend.
 * Retains the original prompt builder and CSV importer and their event handlers.
 * Designed to reinitialise correctly in standalone saved HTML copies.
 */
(function () {
  "use strict";

  var UPGRADE_VERSION = "1.3";
  var originalPromptBuilder = createAiDriverDiagramPrompt;

  function el(tag, className, textValue) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (textValue != null) item.textContent = textValue;
    return item;
  }

  function preferencesLine(options) {
    var wording = {
      preserve: "Preserve the wording of existing source-derived diagram items wherever possible. This does NOT prevent adding new, clearly identified suggestions. Use suitable new wording for additional measures and change ideas.",
      clarify: "Suggest clearer wording without changing meaning, identifying significant revisions.",
      alternatives: "Offer alternative wording for discussion; do not claim it has been agreed."
    };
    var measures = {
      none: "Do not invent or add measures to CSV.",
      existing: "Include only measures supplied by the user and confirmed for inclusion.",
      few: "Propose a small number of relevant outcome, process and, where appropriate, balancing measures. Include them in the provisional draft and in CSV if I request it, unless I exclude them. Label them as AI suggestions during review; do not imply they are agreed or already collected."
    };
    var changes = {
      existing: "Use only change ideas already offered by the user.",
      none: "Do not add change ideas at this stage.",
      suggest: "My selection of this setting IS a request to propose additional change ideas. Include a small number of relevant new change ideas in the provisional draft and CSV if I request it, unless I exclude them. Distinguish AI suggestions from source ideas during review; do not imply they are agreed or proven."
    };
    var colours = {
      app: "Leave colours blank so the diagram tool handles them.",
      branch: "Apply accessible six-digit hex colours by primary-driver branch as selected in the tool.",
      level: "Apply accessible six-digit hex colours by diagram level as selected in the tool.",
      custom: "Before formatting CSV colours, ask for the desired six-digit hex codes; otherwise leave colours blank."
    };
    return [
      "Wording: " + (wording[options.wording] || wording.preserve),
      "Measures: " + (measures[options.measures] || measures.none),
      "Change ideas: " + (changes[options.changes] || changes.existing),
      "Colours: " + (colours[options.colours] || colours.app)
    ].join("\n");
  }

  // Explicit priorities prevent "preserve wording" from suppressing requested additions.
  function contentPreferenceRules(options) {
    var wantMeasures = options.measures === "few";
    var wantChanges = options.changes === "suggest";
    var rules = [
      "HOW THESE PREFERENCES WORK TOGETHER — PRIORITY RULES",
      "1. Treat my wording, measure and change-idea selections as INDEPENDENT instructions. Preserving language applies to source-derived text, NOT to whether you may add requested new content.",
      "2. Preserve the original wording/meaning of source-derived items, but write NEW suggestions in suitable, clear language. Do not silently rewrite existing items merely to make room for new suggestions.",
      "3. Clearly distinguish source-derived items from your own proposed additions in the readable draft and review discussion (for example, a short 'New AI suggestions' subsection). Do not misrepresent suggestions as team-agreed decisions or established evidence.",
      "4. Generate a useful provisional draft with the selected additions rather than making the user separately approve each one before it can appear. Invite me to accept, remove or amend them during review.",
      "5. When I request CSV, export the CURRENT provisional draft, INCLUDING the selected suggestions unless I have rejected them. My CSV request does not mean the team has formally approved them; the imported diagram remains provisional.",
      "6. Do not invent local observations, baselines, targets or clinical effectiveness. If essential context is absent, offer a generic but clearly provisional candidate and identify its uncertainty, or explain briefly why no responsible suggestion is possible.",
      "7. Before sending CSV, check the chosen options against the output: requested change ideas must be present as change-level rows; requested measures must be present in measures_json on the appropriate aim/driver rows; include the required seven-column CSV when measures are present. Never substitute prose suggestions for the requested CSV content."
    ];
    if (wantChanges) rules.push("REQUESTED CHANGE IDEAS: propose about 2–4 specific, relevant and testable candidate interventions across appropriate secondary drivers when the context supports them; avoid repeating existing ideas. Include them in the provisional hierarchy.");
    if (wantMeasures) rules.push("REQUESTED MEASURES: propose about 2–4 meaningful candidate measures across the aim and relevant drivers (an outcome measure and useful process measures; consider a balancing measure where relevant). State what each would indicate and attach it to the right node. Include them in provisional CSV as measures_json when CSV is requested.");
    if (!wantChanges) rules.push("CHANGE IDEAS: follow the selected option; do not add new change ideas when the option forbids them.");
    if (!wantMeasures) rules.push("MEASURES: follow the selected option; do not add new measures when the option forbids them.");
    return rules.join("\n");
  }

  function strengthenQuickPrompt(prompt, options) {
    // Change only the preference instructions in the original builder.
    // Preserve its source material, stages, privacy guidance and CSV contract.
    var oldStart = prompt.indexOf("CONTENT PREFERENCES\n");
    var oldEnd = oldStart === -1 ? -1 : prompt.indexOf("\nCSV OUTPUT CONTRACT", oldStart);
    var newPrefs = [
      "CONTENT PREFERENCES",
      preferencesLine(options),
      "Keep the number of diagram items proportionate to the information provided. A polished diagram is not evidence of validity.",
      "",
      contentPreferenceRules(options)
    ].join("\n");
    if (oldStart !== -1 && oldEnd !== -1) {
      return prompt.slice(0, oldStart) + newPrefs + prompt.slice(oldEnd);
    }
    // Fallback for a working file with a locally customised prompt builder.
    return prompt + "\n\n" + newPrefs;
  }

  function currentDiagramForPrompt() {
    // This is called ONLY after the user explicitly ticks the opt-in checkbox.
    if (typeof nodes === "undefined" || !Array.isArray(nodes) || !nodes.length) {
      return "\nCURRENT DIAGRAM: No existing diagram items were available to include.\n";
    }
    var items = nodes.map(function (n) {
      return {
        id: String(n.id), level: String(n.level || ""),
        parent_id: String(n.parentId || ""), text: String(n.text || ""),
        measures: Array.isArray(n.measures) ? n.measures.map(function (m) {
          return { type: String(m.type || "none"), text: String(m.text || "") };
        }) : []
      };
    });
    var links = (typeof connections !== "undefined" && Array.isArray(connections))
      ? connections.map(function (c) {
          return { from_id: String(c.fromId || ""), to_id: String(c.toId || "") };
        })
      : [];
    return "\nCURRENT DIAGRAM — USER-SELECTED CONTEXT (review before sharing):\n" +
      JSON.stringify({ items: items, connections: links }, null, 2) + "\n";
  }

  function createCoachingPrompt(options) {
    var focusEl = document.getElementById("aiCoachFocus");
    var includeEl = document.getElementById("aiCoachIncludeCurrent");
    var focus = focusEl ? focusEl.value : "review";
    var focusDetails = {
      start: "Help me get started. Clarify the challenge and current system with the smallest number of useful questions, then help me develop an initial provisional theory.",
      review: "Review and strengthen an existing driver diagram. Start from the material I supply and give a concise, constructive initial review; do not restart the project discovery process.",
      connect: "Explore how contributing factors influence one another, including possible mechanisms, shared causes, dependencies, feedback and alternative explanations.",
      test: "Help me spot important gaps, uncertainty and untested assumptions, and decide what observations or tests would most usefully strengthen or challenge the theory.",
      unsure: "Help me find the most valuable next step. Ask at most one useful orienting question if necessary, then suggest one or two support options."
    };
    var out = [
      "AI IMPROVEMENT COACH — Develop or improve a driver diagram",
      "",
      "PURPOSE AND MY CHOSEN SUPPORT",
      "Be an experienced, curious and constructively challenging healthcare quality-improvement facilitator. Help me develop MY (or my team's) understanding and a provisional, testable theory of change. Do not behave as an autonomous clinical decision-maker or assert that the team has agreed with you.",
      focusDetails[focus] || focusDetails.review,
      "",
      "HOW TO WORK WITH ME — MINIMUM USEFUL INPUT, MAXIMUM USEFUL OUTPUT",
      "1. Begin at my current point in the project. If I provide a diagram, workshop output or substantial context, use it first. Never require me to return to the beginning or repeat information already supplied.",
      "2. In your first substantive reply, offer an observation, useful synthesis or small practical next step wherever the material permits; do not begin with an extensive questionnaire.",
      "3. Ask no more than one or two targeted questions per turn, only if answers could materially change the guidance. Prefer a useful provisional response with transparent assumptions over a long intake interview. Stop and wait when you ask a question.",
      "4. Choose flexibly between clarifying the aim and problem, surfacing perspectives and evidence, exploring relationships, challenging assumptions, distilling the emerging theory, and translating it into drivers. These are facilitation moves, NOT required stages.",
      "5. Examine WHY a driver is expected to influence another factor or the aim. Distinguish drivers (conditions/factors) from change ideas (interventions) and measures (ways of learning). Consider feedback loops and effects that a simple hierarchy cannot show.",
      "6. Separate reported facts or observations, participants' interpretations, your hypotheses, conflicting views, uncertainties and missing perspectives. Do not fabricate local facts, references or stakeholder agreement. Do not assume my account equals whole-team consensus.",
      "7. Respectfully challenge weak links, circular explanations, premature solutions and plausible alternative causes. Present suggestions as possibilities, not validated conclusions. Never overstate clinical safety or effectiveness.",
      "8. Be concise, accessible and supportive without repetitive praise. Periodically offer a brief 'what we understand / what is uncertain / next useful question' summary. If I am short of time, offer a quick review or a deeper discussion.",
      "9. Let me change direction or request a provisional diagram at any point. If I choose to proceed with gaps, show what remains uncertain rather than blocking me.",
      "",
      "INFORMATION GOVERNANCE",
      "Do not ask for patient-identifiable, staff-identifiable, other personal or confidential material unless my organisation has specifically authorised this AI environment and the particular use. Names removed from data may still leave people identifiable. If authorisation is uncertain, ask me to use non-identifying general descriptions and consult local information-governance guidance. This tool has not transmitted data to you; anything shared is explicitly pasted by me.",
      "",
      "WHEN WE ARE READY TO DEVELOP A DIAGRAM",
      "Offer (A) a short theory-of-change reasoning summary explaining mechanisms, evidence discussed, alternative accounts, assumptions, disagreements and what needs testing, and (B) a readable provisional hierarchy: Aim → primary drivers → secondary drivers → optional change ideas. Keep uncertainty in the reasoning summary, rather than forcing complex causal loops into the diagram's hierarchy.",
      "Ask for review, but do not imply consensus. Only produce the importable CSV when I request it (including 'Generate the CSV now'). Do not reopen broad discussion at that point unless a critical missing detail would make the CSV invalid.",
      "",
      "DIAGRAM CONTENT PREFERENCES",
      preferencesLine(options),
      "",
      contentPreferenceRules(options),
      "",
      "CSV IMPORT CONTRACT — USE ONLY WHEN I ASK FOR CSV",
      "Return ONLY one fenced ```csv code block and nothing outside it.",
      "For the basic format, use exactly: id,level,parent_id,text",
      "Use the extended format ONLY when colours, extra connections or measures are needed: id,level,parent_id,text,color,extra_parents,measures_json",
      "Use one aim with blank parent_id. Valid levels: aim, primary, secondary, change. Give unique sequential numeric IDs starting at 1. Primary → aim, secondary → primary, change → secondary. Do not create missing-parent or cyclic connections.",
      "Only include genuinely agreed extra links in extra_parents using semicolon-separated IDs. Quote EVERY text field; double embedded double-quotes. Every row must contain the header's exact number of columns. For empty optional extended cells add three trailing commas after the quoted text.",
      "If measures are requested, measures_json contains a JSON array of {type,text} objects; types are outcome, process, balancing or none. Escape JSON correctly in CSV. Do not add auto_size or other columns. Validate CSV structure before replying.",
      "",
      "FIRST REPLY",
      "Focus on the support I selected. If I supplied a diagram, begin with a concise constructive review and no more than two high-value questions. If little context is available, ask the single most useful question. Do not generate a full driver diagram immediately unless I explicitly request it."
    ];
    if (includeEl && includeEl.checked) out.push(currentDiagramForPrompt());
    return out.join("\n");
  }

  function installStyles() {
    if (document.getElementById("aiUpgradeStyles")) return;
    var s = el("style");
    s.id = "aiUpgradeStyles";
    s.textContent = [
      "#aiAssistancePanel.ai-upgraded > summary{display:none!important}",
      "#aiAssistancePanel.ai-upgraded{border:0!important;margin:0!important;padding:0!important}",
      "#aiAssistancePanel.ai-upgraded > .ai-assistance-content{padding:0!important}",
      "#aiGuidanceDialog:has(.ai-upgrade-nav){width:min(900px,96vw);max-height:92dvh;}",
      ".ai-upgrade-nav[hidden],.ai-upgrade-welcome[hidden]{display:none!important}",
      ".ai-upgrade-welcome{padding:0 3px 12px;line-height:1.5}",
      ".ai-upgrade-welcome h3{font-size:1.2rem;margin:2px 0 7px}",
      ".ai-upgrade-welcome h4{font-size:1rem;margin:12px 0 5px}",
      ".ai-upgrade-welcome p{margin:4px 0 10px}",
      ".ai-upgrade-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}",
      ".ai-upgrade-step{border:1px solid #d7e2eb;border-radius:9px;padding:12px;background:#f7f9fc;font-size:.9rem}",
      ".ai-upgrade-step strong{display:block;margin-bottom:4px}",
      ".ai-upgrade-safety{background:#fff9f4;border-left:3px solid #a23a23;padding:10px 14px;margin:14px 0;border-radius:5px}",
      ".ai-upgrade-safety p{margin:5px 0}",
      ".ai-upgrade-welcome details.ai-ig-warning{margin:12px 0}",
      ".ai-upgrade-welcome .ai-privacy-note{margin:10px 0}",
      ".ai-upgrade-welcome .ai-guidance-links{margin:10px 0;font-size:.85rem}",
      ".ai-upgrade-intro-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:16px 0 4px}",
      ".ai-upgrade-intro-actions button{min-height:42px}",
      ".ai-upgrade-backintro{font-size:.82rem;text-align:right;margin:-8px 0 8px}",
      ".ai-upgrade-backintro[hidden]{display:none!important}",
      ".ai-upgrade-backintro button{color:#175781;background:transparent;border:0;text-decoration:underline;font:inherit;cursor:pointer;padding:3px}",
      ".ai-upgrade-legacy{display:none!important}",
      ".ai-upgrade-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 0 16px;padding:4px 0 10px;border-bottom:1px solid #d5dce4;position:sticky;top:0;background:#fff;z-index:2}",
      ".ai-upgrade-tab{appearance:none;border:1px solid #cbd5df;border-radius:9px;background:#f5f7fa;color:#243347;padding:11px 7px;font:inherit;font-weight:600;cursor:pointer;text-align:center;white-space:normal;min-height:42px}",
      ".ai-upgrade-tab[aria-selected='true']{background:#173f64;border-color:#173f64;color:#fff}",
      ".ai-upgrade-tab:focus-visible,.ai-upgrade-path-choice:focus-within{outline:3px solid #1d83bc;outline-offset:2px}",
      ".ai-upgrade-panel[hidden],.ai-upgrade-empty[hidden],.ai-upgrade-chooser[hidden]{display:none!important}",
      ".ai-upgrade-panel{min-height:200px;padding:0 2px 8px}",
      ".ai-upgrade-panel h3{margin:4px 0 7px;font-size:1.12rem}",
      ".ai-upgrade-muted{color:#526373;font-size:.92rem;line-height:1.48;margin:4px 0 14px}",
      ".ai-upgrade-choice-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}",
      ".ai-upgrade-path-choice{display:flex;align-items:flex-start;gap:9px;padding:16px 13px;border:1px solid #cbd5df;border-radius:12px;cursor:pointer;background:#fff;line-height:1.4}",
      ".ai-upgrade-path-choice.is-selected{border-color:#205d87;background:#f0f6fa;box-shadow:inset 0 0 0 1px #205d87}",
      ".ai-upgrade-path-choice input{margin-top:4px;flex:0 0 auto;accent-color:#205d87}",
      ".ai-upgrade-path-choice strong{display:block;margin-bottom:3px}",
      ".ai-upgrade-path-choice small{display:block;font-size:.85rem;color:#526373}",
      ".ai-upgrade-route-detail{padding:12px 14px;background:#f6f8fa;border-radius:10px;margin:10px 0}",
      ".ai-upgrade-route-detail label{display:block;font-weight:650;margin-bottom:5px}",
      ".ai-upgrade-route-detail select{max-width:100%;width:100%}",
      ".ai-upgrade-optin{display:flex;align-items:flex-start;gap:9px;margin-top:12px;font-size:.88rem;line-height:1.45;font-weight:400!important}",
      ".ai-upgrade-optin input{margin-top:3px;flex-shrink:0}",
      ".ai-upgrade-options{margin:12px 0;border:1px solid #d9e1e8;border-radius:9px;padding:8px 12px}",
      ".ai-upgrade-options > summary{cursor:pointer;font-weight:600;padding:4px 0}",
      ".ai-upgrade-options .ai-builder-grid{padding:12px 0 2px}",
      ".ai-upgrade-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}",
      ".ai-upgrade-empty{padding:35px 18px;text-align:center;background:#f6f8fa;border:1px dashed #cad6e0;border-radius:12px}",
      ".ai-upgrade-empty h3{margin:0 0 10px}",
      ".ai-upgrade-empty p{margin:0 0 17px;color:#516273}",
      ".ai-upgrade-prompt-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0}",
      ".ai-upgrade-prompt-holder label{display:block;font-weight:600;margin:8px 0}",
      ".ai-upgrade-prompt-holder textarea{width:100%;min-height:280px}",
      ".ai-upgrade-footer{border-top:1px solid #dfe5ea;margin-top:16px;padding-top:10px;font-size:.9rem}",
      ".ai-upgrade-footer .ai-privacy-note{margin-top:10px}",
      ".ai-upgrade-help-link{border:0;background:transparent;text-decoration:underline;color:#175781;padding:4px 0;font:inherit;cursor:pointer}",
      ".ai-upgrade-help-box{background:#f6f8fa;border:1px solid #dce4eb;border-radius:9px;padding:12px 15px;margin:10px 0}",
      ".ai-upgrade-help-box summary{cursor:pointer;font-weight:650}",
      "#aiGuidanceDialog .ai-upgrade-panel .ai-csv-paste{margin:0;}",
      "@media(max-width:600px){.ai-upgrade-steps{grid-template-columns:1fr}.ai-upgrade-choice-row{grid-template-columns:1fr}.ai-upgrade-nav{gap:3px}.ai-upgrade-tab{padding:10px 3px;font-size:.86rem}.ai-upgrade-panel{padding:0}.ai-upgrade-prompt-holder textarea{min-height:220px}}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function installHelp() {
    if (document.getElementById("aiUpgradeHelp")) return;
    var overlay = document.getElementById("helpOverlay");
    var first = overlay && overlay.querySelector(".faq-question");
    if (!first) return;
    var block = el("details", "ai-upgrade-help-box");
    block.id = "aiUpgradeHelp";
    var summary = el("summary", null, "Creating a useful driver diagram — a quick guide");
    var body = el("div");
    // Fixed authored guidance only; never render user text as HTML.
    body.innerHTML = '<p>A driver diagram is a <strong>working theory of change</strong>, not proof that the theory is correct. It is most useful when the people involved can explain why the connections make sense and use it to guide learning.</p>' +
      '<ul><li><strong>Aim:</strong> a clear, meaningful outcome, for whom and ideally by when.</li>' +
      '<li><strong>Primary drivers:</strong> the major conditions or factors believed necessary for success.</li>' +
      '<li><strong>Secondary drivers:</strong> more specific influences on those primary drivers.</li>' +
      '<li><strong>Change ideas:</strong> proposed actions or tests to influence drivers — not the drivers themselves.</li>' +
      '<li><strong>Measures:</strong> ways to track outcomes, progress and unintended effects.</li></ul>' +
      '<p><strong>A helpful process:</strong> understand the current situation and who is affected; gather relevant perspectives and evidence; consider how factors influence each other; sketch a provisional hierarchy; review it with the team; test and revise it as you learn. You can enter this process at any point and move back and forth.</p>' +
      '<p><strong>Useful checks:</strong> Are we mistaking an intervention for a driver? What evidence or experience supports each important connection? What alternative explanation might fit? Whose views are missing? What would change our minds?</p>' +
      '<p>A tidy diagram cannot fully show feedback loops, disagreements or uncertainty. Keep a separate note of significant assumptions and unresolved relationships.</p>';
    block.appendChild(summary);
    block.appendChild(body);
    first.parentNode.insertBefore(block, first);
  }

  function buildTabs(content) {
    var builder = content.querySelector(".ai-prompt-builder");
    var csv = content.querySelector(".ai-csv-paste");
    var scenario = document.getElementById("aiPromptScenario");
    var grid = builder && builder.querySelector(".ai-builder-grid");
    var makeButton = document.getElementById("aiBuildPrompt");
    var editor = document.getElementById("aiPromptEditor");
    var copy = document.getElementById("aiCopyPrompt");
    var reset = document.getElementById("aiResetPrompt");
    var status = document.getElementById("aiPromptStatus");
    var feedback = document.getElementById("aiCopyFeedback");
    if (!builder || !csv || !scenario || !grid || !makeButton || !editor || !copy || !reset || !status || !feedback) return false;

    var legacy = el("div", "ai-upgrade-legacy");
    Array.from(content.children).forEach(function (child) { legacy.appendChild(child); });
    content.appendChild(legacy);

    var nav = el("div", "ai-upgrade-nav");
    nav.id = "aiUpgradeNav";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "AI guidance sections");
    [
      { id: "choose", name: "Choose help" },
      { id: "prompt", name: "Your prompt" },
      { id: "import", name: "Import CSV" }
    ].forEach(function (tab) {
      var button = el("button", "ai-upgrade-tab", tab.name);
      button.type = "button";
      button.id = "aiUpgradeTab-" + tab.id;
      button.dataset.aiTab = tab.id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", "aiUpgradePanel-" + tab.id);
      nav.appendChild(button);
    });
    content.insertBefore(nav, legacy);

    // Introduction and information governance appear together, outside the work tabs.
    var welcome = el("section", "ai-upgrade-welcome");
    welcome.id = "aiUpgradeWelcome";
    welcome.appendChild(el("h3", null, "How AI assistance works"));
    welcome.appendChild(el("p", null, "The Driver Diagram Tool does not contain AI. It helps you create a tailored prompt to use with an AI chatbot chosen and authorised by your organisation."));
    var steps = el("div", "ai-upgrade-steps");
    [
      ["1. Choose the support", "Create a quick draft or get targeted coaching to improve an existing diagram."],
      ["2. Copy your prompt", "Paste it into an appropriately authorised chatbot such as ChatGPT or Copilot."],
      ["3. Bring back the CSV", "Review the chatbot's suggestions, request importable CSV, then paste it here."]
    ].forEach(function (item) {
      var step = el("div", "ai-upgrade-step");
      step.appendChild(el("strong", null, item[0]));
      step.appendChild(el("span", null, item[1]));
      steps.appendChild(step);
    });
    welcome.appendChild(steps);
    welcome.appendChild(el("p", null, "Nothing is sent to an AI service automatically. The tool only generates text for you to review, copy and share yourself."));
    var safety = el("div", "ai-upgrade-safety");
    safety.appendChild(el("strong", null, "Before sharing information with AI"));
    safety.appendChild(el("p", null, "Only use an AI service authorised by your organisation for this particular information and purpose. Do not share patient-identifiable, staff-identifiable, confidential or otherwise sensitive information without appropriate authorisation; removing names alone may not prevent identification."));
    safety.appendChild(el("p", null, "AI can make mistakes and produce plausible but unsupported diagrams. Your team must critically review any proposed drivers, relationships and measures before using them."));
    welcome.appendChild(safety);
    var ig = legacy.querySelector(".ai-ig-warning");
    if (ig) { ig.open = false; welcome.appendChild(ig); }
    var privacy = legacy.querySelector(".ai-privacy-note");
    if (privacy) welcome.appendChild(privacy);
    var links = legacy.querySelector(".ai-guidance-links");
    if (links) welcome.appendChild(links);
    var guide = el("button", "ai-upgrade-help-link", "What makes a useful driver diagram?");
    guide.type = "button";
    guide.id = "aiUpgradeHelpLink";
    welcome.appendChild(guide);
    var introActions = el("div", "ai-upgrade-intro-actions");
    var introContinue = el("button", null, "Continue to AI guidance");
    introContinue.type = "button";
    introContinue.id = "aiUpgradeContinue";
    introActions.appendChild(introContinue);
    var introImport = el("button", null, "Go straight to Import CSV");
    introImport.type = "button";
    introImport.id = "aiUpgradeIntroImport";
    introActions.appendChild(introImport);
    welcome.appendChild(introActions);
    content.insertBefore(welcome, nav);

    var backIntro = el("div", "ai-upgrade-backintro");
    var backButton = el("button", null, "How AI works & safety");
    backButton.type = "button";
    backButton.id = "aiUpgradeBackIntro";
    backIntro.appendChild(backButton);
    content.insertBefore(backIntro, legacy);

    var panes = {};
    ["choose", "prompt", "import"].forEach(function (name) {
      var pane = el("section", "ai-upgrade-panel");
      pane.id = "aiUpgradePanel-" + name;
      pane.setAttribute("role", "tabpanel");
      pane.setAttribute("aria-labelledby", "aiUpgradeTab-" + name);
      pane.tabIndex = 0;
      panes[name] = pane;
      content.insertBefore(pane, legacy);
    });

    panes.choose.appendChild(el("h3", null, "What would you like help with?"));

    var routes = el("div", "ai-upgrade-choice-row");
    function route(value, title, description, checked) {
      var label = el("label", "ai-upgrade-path-choice");
      var input = el("input");
      input.type = "radio";
      input.name = "aiUpgradeRoute";
      input.value = value;
      input.checked = checked;
      var words = el("span");
      words.appendChild(el("strong", null, title));
      words.appendChild(el("small", null, description));
      label.appendChild(input);
      label.appendChild(words);
      routes.appendChild(label);
    }
    route("quick", "Create a driver diagram", "Use one of the three original prompts for a quick, provisional diagram.", true);
    route("coach", "Get AI coaching", "Develop or strengthen your thinking, starting wherever you are.", false);
    panes.choose.appendChild(routes);

    var quick = el("div", "ai-upgrade-route-detail ai-upgrade-chooser");
    quick.id = "aiUpgradeQuick";
    var scenarioRow = scenario.parentElement;
    quick.appendChild(scenarioRow);
    panes.choose.appendChild(quick);

    var coach = el("div", "ai-upgrade-route-detail ai-upgrade-chooser");
    coach.id = "aiUpgradeCoach";
    coach.hidden = true;
    var coachLabel = el("label", null, "What would be most useful?");
    coachLabel.htmlFor = "aiCoachFocus";
    var focus = el("select");
    focus.id = "aiCoachFocus";
    [
      ["review", "Review and improve my existing diagram"],
      ["start", "Help me get started"],
      ["connect", "Explore contributing factors and their relationships"],
      ["test", "Find gaps, assumptions and what to test"],
      ["unsure", "I'm not sure — help me decide"]
    ].forEach(function (entry) {
      var opt = el("option", null, entry[1]);
      opt.value = entry[0];
      focus.appendChild(opt);
    });
    coach.appendChild(coachLabel);
    coach.appendChild(focus);
    coach.appendChild(el("p", "ai-upgrade-muted", "The chatbot will start from your existing work rather than take you through a fixed process."));
    var opt = el("label", "ai-upgrade-optin");
    var check = el("input");
    check.type = "checkbox";
    check.id = "aiCoachIncludeCurrent";
    var txt = el("span", null, "Include the current diagram in the generated prompt (optional). Only select this if the diagram is appropriate to share in your approved AI service. Review the resulting prompt before copying.");
    opt.appendChild(check);
    opt.appendChild(txt);
    coach.appendChild(opt);
    panes.choose.appendChild(coach);

    var preferences = el("details", "ai-upgrade-options");
    preferences.appendChild(el("summary", null, "Additional options — wording, measures, changes and colours"));
    preferences.appendChild(grid);
    panes.choose.appendChild(preferences);
    var action = el("div", "ai-upgrade-actions");
    makeButton.textContent = "Generate prompt";
    action.appendChild(makeButton);
    panes.choose.appendChild(action);

    panes.prompt.appendChild(el("h3", null, "Your personalised prompt"));
    panes.prompt.appendChild(el("p", "ai-upgrade-muted", "Review, edit and copy the text into an AI chatbot authorised for this task and information. Your edits are not changed when you switch tabs."));
    var empty = el("div", "ai-upgrade-empty");
    empty.id = "aiUpgradePromptEmpty";
    empty.appendChild(el("h3", null, "No prompt generated yet"));
    empty.appendChild(el("p", null, "Choose the AI help you need and generate a prompt. You can also go straight to Import CSV."));
    var goChoose = el("button", null, "Choose help");
    goChoose.id = "aiUpgradeGoChoose";
    goChoose.type = "button";
    empty.appendChild(goChoose);
    panes.prompt.appendChild(empty);
    var promptHolder = el("div", "ai-upgrade-prompt-holder");
    promptHolder.id = "aiUpgradePromptHolder";
    promptHolder.hidden = true;
    var promptLabel = builder.querySelector('label[for="aiPromptEditor"]');
    if (promptLabel) promptHolder.appendChild(promptLabel);
    promptHolder.appendChild(editor);
    var promptActions = el("div", "ai-upgrade-prompt-controls");
    promptActions.appendChild(copy);
    promptActions.appendChild(reset);
    promptActions.appendChild(feedback);
    promptHolder.appendChild(promptActions);
    promptHolder.appendChild(status);
    panes.prompt.appendChild(promptHolder);

    panes.import.appendChild(csv);

    return true;
  }

  function initialiseUpgrade() {
    var dialog = document.getElementById("aiGuidanceDialog");
    var details = document.getElementById("aiAssistancePanel");
    var content = details && details.querySelector(".ai-assistance-content");
    var scenario = document.getElementById("aiPromptScenario");
    var editor = document.getElementById("aiPromptEditor");
    var build = document.getElementById("aiBuildPrompt");
    if (!dialog || !details || !content || !scenario || !editor || !build) return;

    installStyles();
    installHelp();
    if (!document.getElementById("aiUpgradeNav") && !buildTabs(content)) return;
    details.classList.add("ai-upgraded");
    details.open = true;

    var tabs = Array.from(content.querySelectorAll(".ai-upgrade-tab"));
    var routes = Array.from(content.querySelectorAll('input[name="aiUpgradeRoute"]'));
    var quick = document.getElementById("aiUpgradeQuick");
    var coach = document.getElementById("aiUpgradeCoach");
    var empty = document.getElementById("aiUpgradePromptEmpty");
    var promptHolder = document.getElementById("aiUpgradePromptHolder");
    var helpLink = document.getElementById("aiUpgradeHelpLink");
    var helpButton = document.getElementById("btnHelp");
    var welcome = document.getElementById("aiUpgradeWelcome");
    var nav = document.getElementById("aiUpgradeNav");
    var backIntro = content.querySelector(".ai-upgrade-backintro");
    var continueButton = document.getElementById("aiUpgradeContinue");
    var importButton = document.getElementById("aiUpgradeIntroImport");
    var returnButton = document.getElementById("aiUpgradeBackIntro");
    if (tabs.length !== 3 || routes.length !== 2 || !quick || !coach || !empty || !promptHolder ||
        !welcome || !nav || !backIntro || !continueButton || !importButton || !returnButton) return;

    // The upgrade no longer adds 'Get AI coaching' to the quick diagram dropdown.
    scenario.querySelectorAll('option[value="coach"]').forEach(function (option) { option.remove(); });
    if (!scenario.value) scenario.value = "draft";

    function selectTab(name, focusTab) {
      tabs.forEach(function (tab) {
        var selected = tab.dataset.aiTab === name;
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
        var panel = document.getElementById("aiUpgradePanel-" + tab.dataset.aiTab);
        if (panel) panel.hidden = !selected;
        if (selected && focusTab) tab.focus();
      });
      // Only the AI dialog scroll changes; the user's main diagram is unaffected.
      dialog.scrollTop = 0;
    }

    function showWorkspace(tabName, focusTab) {
      welcome.hidden = true;
      nav.hidden = false;
      backIntro.hidden = false;
      selectTab(tabName || "choose", !!focusTab);
    }

    function showWelcome(focusButton) {
      welcome.hidden = false;
      nav.hidden = true;
      backIntro.hidden = true;
      tabs.forEach(function (tab) {
        var panel = document.getElementById("aiUpgradePanel-" + tab.dataset.aiTab);
        if (panel) panel.hidden = true;
      });
      dialog.scrollTop = 0;
      if (focusButton) continueButton.focus();
    }

    function syncRoute() {
      var chosen = routes.filter(function (r) { return r.checked; })[0];
      var mode = chosen ? chosen.value : "quick";
      quick.hidden = mode !== "quick";
      coach.hidden = mode !== "coach";
      routes.forEach(function (r) {
        r.closest("label").classList.toggle("is-selected", r.checked);
      });
    }

    function promptVisibility() {
      var hasPrompt = !!editor.value.trim();
      empty.hidden = hasPrompt;
      promptHolder.hidden = !hasPrompt;
    }

    // Original builder remains responsible for prompt generation and copy/reset.
    // This function is the only change to which prompt it generates for 'coach'.
    createAiDriverDiagramPrompt = function (options) {
      var activeRoute = document.querySelector('input[name="aiUpgradeRoute"]:checked');
      if (activeRoute && activeRoute.value === "coach") return createCoachingPrompt(options);
      return strengthenQuickPrompt(originalPromptBuilder(options), options);
    };

    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () { showWorkspace(tab.dataset.aiTab); });
      tab.addEventListener("keydown", function (event) {
        var indexToFocus;
        if (event.key === "ArrowRight") indexToFocus = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") indexToFocus = (index + tabs.length - 1) % tabs.length;
        else if (event.key === "Home") indexToFocus = 0;
        else if (event.key === "End") indexToFocus = tabs.length - 1;
        else return;
        event.preventDefault();
        showWorkspace(tabs[indexToFocus].dataset.aiTab, true);
      });
    });
    routes.forEach(function (r) { r.addEventListener("change", syncRoute); });
    build.addEventListener("click", function () {
      promptVisibility();
      if (editor.value.trim()) showWorkspace("prompt", true);
    });
    var reset = document.getElementById("aiResetPrompt");
    if (reset) reset.addEventListener("click", promptVisibility);
    editor.addEventListener("input", promptVisibility);
    var goChoose = document.getElementById("aiUpgradeGoChoose");
    if (goChoose) goChoose.addEventListener("click", function () { showWorkspace("choose", true); });
    continueButton.addEventListener("click", function () { showWorkspace("choose", true); });
    importButton.addEventListener("click", function () { showWorkspace("import", true); });
    returnButton.addEventListener("click", function () { showWelcome(true); });

    // The original application closes the dialog on backdrop clicks. Prevent
    // those accidental closures while retaining the X button and Escape key.
    dialog.addEventListener("click", function (event) {
      if (event.target !== dialog) return;
      var rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    if (helpLink && helpButton) helpLink.addEventListener("click", function () {
      dialog.close();
      window.setTimeout(function () {
        helpButton.click();
        var guide = document.getElementById("aiUpgradeHelp");
        if (guide) guide.open = true;
      }, 0);
    });
    dialog.addEventListener("close", function () {
      // Existing driver.js deliberately clears temporary prompt and CSV on close.
      // Match those established privacy-preserving semantics.
      routes[0].checked = true;
      routes[1].checked = false;
      syncRoute();
      var include = document.getElementById("aiCoachIncludeCurrent");
      if (include) include.checked = false;
      var ig = document.querySelector("#aiUpgradeWelcome .ai-ig-warning");
      if (ig) ig.open = false;
      promptVisibility();
      showWelcome(false);
    });
    // Reloaded standalone HTML retains DOM, but event handlers are reattached.
    routes[0].checked = true;
    routes[1].checked = false;
    syncRoute();
    promptVisibility();
    showWelcome(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseUpgrade);
  } else {
    initialiseUpgrade();
  }
})();
/* END DRIVER DIAGRAM TOOL AI GUIDANCE THREE-TAB UPGRADE v1.3 */

