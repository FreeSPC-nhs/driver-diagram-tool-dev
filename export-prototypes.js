/*
 * Driver Diagram Tool — P0 export comparison (experimental, non-destructive)
 * Adds two TEST buttons. Existing PNG/PDF export functions are not changed.
 * Version: 2026-11-18-p0b
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
    if (window.diagramViewMode === "outline" &&
        typeof window.switchDiagramView === "function") {
      window.switchDiagramView("diagram");
    }
    afterTwoFrames(function () {
      var area = document.getElementById("exportArea");
      var canvas = document.getElementById("diagramCanvas");
      var connections = document.getElementById("diagramConnections");
      if (!area || !canvas || !connections || !area.getBoundingClientRect().width) {
        notify("The diagram could not be located for this export test.");
        return;
      }
      callback(area, canvas, connections);
    });
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
        var rect = area.getBoundingClientRect();
        var fullWidth = Math.ceil(rect.width);
        var fullHeight = Math.ceil(rect.height);
        // A3 landscape is 420 × 297 mm. Reserve 5 mm margin each side.
        // CSS uses 96 px/in for physical units; preserve the original diagram layout.
        var fitWidth = (420 - 10) * 96 / 25.4;
        var fitHeight = (297 - 10) * 96 / 25.4;
        var scale = Math.min(1, fitWidth / fullWidth, fitHeight / fullHeight);
        var shownWidth = Math.ceil(fullWidth * scale);
        var shownHeight = Math.ceil(fullHeight * scale);
        var sampleMeasure = area.querySelector(".diagram-measure-row > span:last-child");
        var measurePx = sampleMeasure
          ? parseFloat(window.getComputedStyle(sampleMeasure).fontSize) : 10;
        var effectiveMeasurePt = measurePx * scale * 0.75;
        var qualityWarning = effectiveMeasurePt < 7
          ? "Note: A3 fit makes measure text approximately " +
            effectiveMeasurePt.toFixed(1) + " pt. An A2 option may be needed."
          : "Text stays vector-based; compare with the on-screen diagram.";
        var clone = cleanCloneForPrint(area);
        clone.style.setProperty("width", fullWidth + "px", "important");
        clone.style.setProperty("max-width", "none", "important");
        var css = [
          "@page { size: A3 landscape; margin: 5mm; }",
          "* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }",
          "html,body { margin:0 !important; padding:0 !important; background:#fff !important; }",
          "#p0-actions { box-sizing:border-box; display:flex; gap:8px; align-items:center; padding:10px; font:14px sans-serif; background:#f1f5f9; color:#1e293b; }",
          "#p0-actions button { font:inherit; border:1px solid #94a3b8; background:white; color:#111; padding:6px 12px; cursor:pointer; border-radius:5px; }",
          "#p0-actions p { margin:0 0 0 auto; font-size:12px; }",
          "#p0-page { position:relative; width:" + shownWidth + "px; height:" + shownHeight + "px; margin:8px auto; overflow:visible; }",
          "#exportArea { box-sizing:border-box; width:" + fullWidth + "px !important; max-width:none !important; transform:scale(" + scale.toFixed(8) + "); transform-origin:0 0; }",
          "#exportArea #diagramCanvasWrapper { overflow:visible !important; }",
          "#exportArea .diagram-add,#exportArea .diagram-quick-add-measure,#exportArea .diagram-edit-pencil,#exportArea .diagram-delete-button,#exportArea .diagram-color-badge,#exportArea .diagram-inline-actions { display:none !important; }",
          "#exportArea .diagram-node.diagram-selected { outline:none !important; }",
          "#exportArea .diagram-measure-row { outline:none !important; background:transparent !important; box-shadow:none !important; }",
          "#exportArea .diagram-connection-hit { display:none !important; }",
          "@media print { #p0-actions { display:none !important; } #p0-page { margin:0 auto !important; break-inside:avoid !important; page-break-inside:avoid !important; } }"
        ].join("\n");
        var markup = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Driver diagram — vector PDF test</title>' +
          copyStylesForPrint() + "<style>" + css + "</style></head><body>" +
          '<div id="p0-actions"><button type="button" onclick="window.print()">Print / Save as PDF</button>' +
          '<button type="button" onclick="window.close()">Close</button>' +
          '<p>' + escapeHtml(qualityWarning) + '</p></div>' +
          '<div id="p0-page">' + clone.outerHTML + '</div>' +
          '<script>Promise.resolve(document.fonts && document.fonts.ready).then(function(){' +
          'if (!window.opener || !window.opener.__P0_SKIP_PRINT) setTimeout(function(){window.print()},400);' +
          '});<\/script></body></html>';
        preview.document.open();
        preview.document.write(markup);
        preview.document.close();
      } catch (error) {
        console.error("P0 print preview error", error);
        try { preview.close(); } catch (ignore) {}
        notify("Could not prepare the vector PDF test: " + error.message);
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
    var base = area.getBoundingClientRect();
    var width = Math.ceil(base.width);
    var height = Math.ceil(base.height);
    var root = svgElement("svg", {
      xmlns: SVG_NS, version:"1.1", viewBox:"0 0 " + width + " " + height,
      width:width, height:height, role:"img",
      "aria-label":"Driver diagram with measures and legend"
    });
    root.appendChild(svgElement("title")).textContent = "Driver Diagram — experimental vector export";
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
    if (editingBlocked("testing SVG export")) return;
    prepareSvg().then(function (svg) {
      var content = new XMLSerializer().serializeToString(svg);
      var blob = new Blob([content], {type:"image/svg+xml;charset=utf-8"});
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href=url; a.download="driver-diagram-vector-TEST.svg";
      document.body.appendChild(a);
      a.click(); a.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    }).catch(function (error) {
      console.error("P0 SVG export error",error);
      notify("The SVG test could not be created: " + error.message);
    });
  }


  // Independent high-resolution PNG test; no html2canvas dependency.
  function saveVectorPng() {
    if (editingBlocked("testing vector PNG export")) return;
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
      link.download="driver-diagram-vector-TEST.png";
      document.body.appendChild(link);
      link.click();link.remove();
      window.setTimeout(function () {URL.revokeObjectURL(url);},30000);
    }).catch(function (error) {
      console.error("P0 vector PNG export error",error);
      notify("The experimental PNG export failed: " + error.message);
    });
  }

  function addButton(parent, label, handler, id) {
    if (document.getElementById(id)) return;
    var b = document.createElement("button");
    b.id=id; b.type="button"; b.textContent=label;
    b.title="Experimental export. Existing export buttons are unchanged.";
    b.addEventListener("click",handler);
    parent.appendChild(b);
  }
  function install() {
    var panel = document.querySelector("header.app-header .header-buttons");
    if (!panel) {
      console.warn("P0 prototypes: toolbar not found");
      return;
    }
    addButton(panel,"Test vector PDF…",printPreview,"btnP0VectorPdf");
    addButton(panel,"Test SVG export",saveSvg,"btnP0ExportSvg");
    addButton(panel,"Test vector PNG",saveVectorPng,"btnP0ExportPng");
  }
  // Expose only for automated validation; the production editor is untouched.
  window.driverExportP0 = { printPreview:printPreview, prepareSvg:prepareSvg, saveVectorPng:saveVectorPng };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",install,{once:true});
  } else { install(); }
})();
