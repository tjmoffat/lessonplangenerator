// ===== ADMIN PROMPT MANAGEMENT SCRIPT =====

// --- Global State ---
let allPrompts = {};
let loaded = false;
let currentPrompt = null;
let currentFilename = null;
let undoStack = [];
let redoStack = [];
let saveTimeout = null;
let lastSavedContent = "";
let lastLoadedTags = [];
let versionPreviewContent = "";
const AUTOSAVE_DELAY = 900; // ms

// --- Tag Categories (edit as you expand) ---
const TAG_GROUPS = [
  {
    label: "Primary Focus",
    options: [
      "Reading", "Writing", "Listening", "Speaking", "Grammar", "Vocabulary", "Pronunciation", "Functional Language"
    ]
  },
  {
    label: "Duration (Minutes)",
    options: ["30", "45", "60", "90", "120"]
  },
  {
    label: "Language Level (CEFR)",
    options: [
      "A1 (Beginner)", "A2 (Elementary)", "B1 (Intermediate)",
      "B2 (Upper-Intermediate)", "C1 (Advanced)", "C2 (Proficiency)"
    ]
  },
  {
    label: "Age Group",
    options: [
      "Early Years (5–7)", "Primary (8–11)", "Lower Secondary (12–14)",
      "Upper Secondary (15–17)", "Adults (18+)"
    ]
  },
  {
    label: "Secondary Focus",
    options: [
      "Reading", "Writing", "Listening", "Speaking", "Grammar", "Vocabulary", "Pronunciation", "Functional Language"
    ]
  }
];

// --- Login Logic ---
function loadPrompts(callback) {
  const secret = document.getElementById("secret")?.value || sessionStorage.getItem("adminSecret");
  if (!secret) {
    alert("Admin secret required");
    return;
  }
  fetch("http://localhost:3000/admin/prompts", { headers: { "x-admin-secret": secret } })
    .then(res => {
      if (!res.ok) throw new Error("Unauthorized or server error");
      return res.json();
    })
    .then(data => {
      allPrompts = JSON.parse(JSON.stringify(data));
      loaded = true;
      sessionStorage.setItem("adminSecret", secret);
      document.getElementById("login-panel").style.display = "none";
      document.getElementById("main-panel").style.display = "";
      renderPromptList("", callback);
    })
    .catch(err => {
      alert("Error loading prompts: " + err.message);
      sessionStorage.removeItem("adminSecret");
    });
}

// --- Render Prompt List Grouped by Call ---
function renderPromptList(query, callback) {
  if (!loaded) return;
  const container = document.getElementById("prompt-list");
  container.innerHTML = "";
  const q = (query || "").toLowerCase();

  const groups = {};
  Object.entries(allPrompts).forEach(([filename, prompt]) => {
    if (!filename || !prompt || typeof prompt !== "object") return;
    if (q && !JSON.stringify(prompt).toLowerCase().includes(q) && !filename.toLowerCase().includes(q)) return;
    const groupKey = prompt.component || (filename.match(/^prompt\d+/) || ["Other"])[0];
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push({ filename, ...prompt });
  });

  Object.keys(groups).sort().forEach(groupKey => {
    const groupDiv = document.createElement("div");
    groupDiv.className = "prompt-group";

    const header = document.createElement("button");
    header.className = "accordion-header";
    header.textContent = `► ${groupKey.toUpperCase()}`;
    groupDiv.appendChild(header);

    const listDiv = document.createElement("div");
    listDiv.className = "accordion-body";
    listDiv.style.display = "none";

    groups[groupKey].forEach(prompt => {
      const wrapper = document.createElement("div");
      wrapper.style.width = "100%";
      wrapper.style.marginBottom = "0.5rem";

      const btn = document.createElement("button");
      btn.textContent = `${prompt.label || prompt.filename} (${prompt.filename})`;
      btn.style.display = "block";
      btn.style.width = "100%";
      btn.onclick = () => showInlineEditor(listDiv, prompt.filename, prompt.label || prompt.filename, prompt.tags || [], prompt.history || []);

      wrapper.appendChild(btn);
      listDiv.appendChild(wrapper);
    });

    groupDiv.appendChild(listDiv);
    container.appendChild(groupDiv);

    // Accordion logic
    header.onclick = function () {
      if (listDiv.style.display === "block") {
        listDiv.style.display = "none";
        header.textContent = `► ${groupKey.toUpperCase()}`;
      } else {
        document.querySelectorAll(".accordion-body").forEach(el => el.style.display = "none");
        document.querySelectorAll(".accordion-header").forEach(el => el.textContent = el.textContent.replace("▼", "►"));
        listDiv.style.display = "block";
        header.textContent = `▼ ${groupKey.toUpperCase()}`;
      }
    };
  });

  if (callback) callback();
}

// --- Show Inline Editor ---
function showInlineEditor(parentDiv, filename, label, tags, history) {
  document.querySelectorAll(".inline-editor").forEach(el => el.remove());
  currentPrompt = null;
  currentFilename = filename;
  lastOpenedPrompt = filename;
  undoStack = [];
  redoStack = [];
  versionPreviewContent = "";

  const editorDiv = document.createElement("div");
  editorDiv.className = "inline-editor";

  // LEFT: Textarea + Undo/Redo
  const leftDiv = document.createElement("div");
  leftDiv.className = "editor-left";
  leftDiv.innerHTML = `
    <h2 id="editor-title">Edit: ${label} (${filename})</h2>
    <textarea id="editor-text" rows="28"
      style="
        width: 100%;
        min-width: 620px;
        max-width: 100%;
        height: 620px;
        font-size: 1.00em;
        padding: 1.2rem 1.4rem;
        font-family: monospace;
        border-radius: 12px;
        border: 1.5px solid #9cb2cf;
        background: #f9fcff;
        box-sizing: border-box;
        resize: vertical;
        line-height: 1.7;
        color: #1a2340;
      "
    ></textarea>
    <br>
    <button id="undo-btn" style="margin-right:8px;">Undo</button>
    <button id="redo-btn">Redo</button>
    <span id="save-status" style="margin-left:1.5rem; color:green;"></span>
    <button id="delete-prompt-btn" style="margin-top:1.2em; color:#fff; background:#e33; padding:0.4em 1em; border-radius:7px; border:none;">Delete Prompt</button>
  `;
  editorDiv.appendChild(leftDiv);

  // RIGHT: Tags + Version history
  const rightDiv = document.createElement("div");
  rightDiv.className = "editor-right";
  rightDiv.innerHTML = `<div class="tag-section"><h3>Tags</h3><div id="tag-panel"></div>
    <input type="text" id="custom-tag-input" placeholder="Add custom tag and press Enter" style="width:100%;margin:6px 0 0 0; padding:0.5rem;">
  </div>
  <div class="version-list">
    <h3>Version History</h3>
    <select id="version-select" style="margin-bottom: 0.6rem;"><option value="">Select version to preview</option></select>
    <button id="restore-btn" disabled>Restore This Version</button>
    <div id="version-preview" style="margin-top:1rem;font-size:0.97em;background:#eef3fa;padding:0.7em;border-radius:7px;min-height:36px;"></div>
  </div>
  `;
  editorDiv.appendChild(rightDiv);

  parentDiv.appendChild(editorDiv);

  // --- Delete prompt handler ---
  const deleteBtn = document.getElementById("delete-prompt-btn");
  if (deleteBtn) {
    deleteBtn.onclick = function() {
      if (!confirm("Are you sure you want to permanently delete this prompt? This cannot be undone!")) return;
      const secret = sessionStorage.getItem("adminSecret");
      fetch(`http://localhost:3000/api/prompts/${encodeURIComponent(currentFilename)}`, {
        method: "DELETE",
        headers: {
          "x-admin-secret": secret
        }
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert("Prompt deleted!");
          loadPrompts();
          document.querySelectorAll(".inline-editor").forEach(el => el.remove());
        } else {
          alert("Delete failed: " + (data.error || "Unknown error"));
        }
      });
    }
  }

  // Load content & tags
  loadPromptContent(filename, tags);

  // Render tags
  renderTagsPanel(tags, filename);

  // Render versions
  renderVersionList(history);

  // Undo/Redo
  document.getElementById("undo-btn").onclick = () => {
    if (undoStack.length > 0) {
      redoStack.push(document.getElementById("editor-text").value);
      const prev = undoStack.pop();
      document.getElementById("editor-text").value = prev;
      handleTextEdit();
    }
  };
  document.getElementById("redo-btn").onclick = () => {
    if (redoStack.length > 0) {
      undoStack.push(document.getElementById("editor-text").value);
      const next = redoStack.pop();
      document.getElementById("editor-text").value = next;
      handleTextEdit();
    }
  };

  document.getElementById("editor-text").oninput = () => {
    handleTextEdit();
  };

  document.getElementById("tag-panel").onchange = saveTags;
  document.getElementById("custom-tag-input").onkeydown = function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      let val = this.value.trim();
      if (val && !lastLoadedTags.includes(val)) {
        lastLoadedTags.push(val);
        renderTagsPanel(lastLoadedTags, filename);
        saveTags();
      }
      this.value = "";
    }
  };
}

// --- Load Prompt Content + Tags ---
function loadPromptContent(filename, tags) {
  const secret = sessionStorage.getItem("adminSecret");
  if (!secret) return alert("You must log in first!");
  fetch(`http://localhost:3000/api/prompts/${encodeURIComponent(filename)}`)
    .then(res => res.json())
    .then(({ content }) => {
      currentPrompt = content || "";
      document.getElementById("editor-text").value = currentPrompt;
      lastSavedContent = currentPrompt;
      lastLoadedTags = [...tags];
      undoStack = [];
      redoStack = [];
      document.getElementById("save-status").textContent = "";
    });
}

// --- Render Tags Panel ---
function renderTagsPanel(selected, filename) {
  const panel = document.getElementById("tag-panel");
  panel.innerHTML = "";
  TAG_GROUPS.forEach(group => {
    const groupDiv = document.createElement("div");
    groupDiv.style.marginBottom = "0.7em";

    const title = document.createElement("strong");
    title.textContent = group.label + ":";
    groupDiv.appendChild(title);
    groupDiv.appendChild(document.createElement("br"));

    const radioName = `group-${group.label.replace(/\s+/g, "-").toLowerCase()}-${filename}`;
    group.options.forEach(tag => {
      const label = document.createElement("label");
      label.className = "tag-checkbox";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = radioName;
      input.value = tag;
      input.checked = selected.includes(tag);

      // Save tags instantly on change
      input.addEventListener("change", function () {
        if (this.checked) {
          // Remove other tags from same group, then add this one
          const withoutThisGroup = selected.filter(
            t => !group.options.includes(t)
          );
          withoutThisGroup.push(tag);
          lastLoadedTags = withoutThisGroup;
          renderTagsPanel(lastLoadedTags, filename);
          saveTags();
        }
      });

      label.appendChild(input);
      label.append(" " + tag);
      groupDiv.appendChild(label);
    });
    panel.appendChild(groupDiv);
  });

  // --- Custom tags as checkboxes ---
  const allGroupTags = TAG_GROUPS.flatMap(g => g.options);
  selected.filter(tag => !allGroupTags.includes(tag)).forEach(tag => {
    const label = document.createElement("label");
    label.className = "tag-checkbox";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tag;
    input.checked = true;
    // Save tags instantly on change
    input.addEventListener("change", function () {
      if (!this.checked) {
        lastLoadedTags = lastLoadedTags.filter(t => t !== tag);
      } else {
        lastLoadedTags.push(tag);
      }
      renderTagsPanel(lastLoadedTags, filename);
      saveTags();
    });

    label.appendChild(input);
    label.append(` ${tag} `);

    const span = document.createElement("span");
    span.style.color = "#7b7b7b";
    span.textContent = "(custom)";
    label.appendChild(span);

    panel.appendChild(label);
  });
}

// --- Save Tags Instantly and Keep Accordion Open ---
function saveTags() {
  const secret = sessionStorage.getItem("adminSecret");
  if (!secret) return alert("You must log in first!");
  const tags = [];
  TAG_GROUPS.forEach(group => {
    const radioName = `group-${group.label.replace(/\s+/g, "-").toLowerCase()}-${currentFilename}`;
    const selectedRadio = document.querySelector(`input[name="${radioName}"]:checked`);
    if (selectedRadio) tags.push(selectedRadio.value);
  });
  const customCheckboxes = document.querySelectorAll('#tag-panel input[type="checkbox"]:checked');
  customCheckboxes.forEach(cb => tags.push(cb.value));
  lastLoadedTags = tags;

  // Remember which group is open and which prompt is selected
  const openAccordionHeader = document.querySelector('.accordion-header:not([style*="none"])');
  const openGroupKey = openAccordionHeader
    ? openAccordionHeader.textContent.replace(/^[►▼]\s*/, '').toLowerCase()
    : null;
  const selectedPromptFilename = currentFilename;

  fetch(`http://localhost:3000/api/prompts/${encodeURIComponent(currentFilename)}/tags`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": secret
    },
    body: JSON.stringify({ tags })
  })



  
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        alert("Failed to save tags!");
        return;
      }
      if (allPrompts[currentFilename]) {
        allPrompts[currentFilename].tags = [...tags];
      }
      // Re-render the list and restore accordion/prompt state
      renderPromptList(document.getElementById("search")?.value || "", function () {
        if (openGroupKey) {
          document.querySelectorAll('.accordion-header').forEach(header => {
            if (header.textContent.toLowerCase().includes(openGroupKey)) {
              header.click();
              setTimeout(() => {
                document.querySelectorAll("#prompt-list button").forEach(btn => {
                  if (btn.textContent.includes(selectedPromptFilename)) {
                    btn.click();
                  }
                });
              }, 10);
            }
          });
        }
      });
    });
}

// --- Autosave With Debounce, Push Undo ---
function handleTextEdit() {
  const textArea = document.getElementById("editor-text");
  const newText = textArea.value;
  if (undoStack.length === 0 || undoStack[undoStack.length - 1] !== lastSavedContent) {
    undoStack.push(lastSavedContent);
    redoStack = [];
  }
  lastSavedContent = newText;
  clearTimeout(saveTimeout);
  document.getElementById("save-status").textContent = "Saving...";
  saveTimeout = setTimeout(() => {
    savePromptContent(newText);
  }, AUTOSAVE_DELAY);
}

// --- Save Prompt Content (Versioned) ---
function savePromptContent(content) {
  const secret = sessionStorage.getItem("adminSecret");
  if (!secret) {
    alert("Missing admin secret");
    return;
  }

  const reopen = currentFilename;

  fetch(`http://localhost:3000/api/prompts/${encodeURIComponent(currentFilename)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": secret
    },
    body: JSON.stringify({ content })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        document.getElementById("save-status").textContent = "✅ Saved!";
        setTimeout(() => {
          document.getElementById("save-status").textContent = "";
        }, 1100);

        if (!allPrompts[reopen]) {
          loadPrompts(() => {
            const promptButtons = document.querySelectorAll("#prompt-list button");
            promptButtons.forEach(btn => {
              if (btn.textContent.includes(reopen)) {
                btn.click();
              }
            });
          });
        }

      } else {
        document.getElementById("save-status").textContent = "❌ Failed!";
        alert("Save failed: " + (data.error || "Unknown error"));
      }
    })
    .catch(err => {
      document.getElementById("save-status").textContent = "❌ Failed!";
      alert("Error saving prompt: " + err.message);
    });
}

// --- Render Version List ---
function renderVersionList(history) {
  const select = document.getElementById("version-select");
  const restoreBtn = document.getElementById("restore-btn");
  const previewDiv = document.getElementById("version-preview");
  select.innerHTML = `<option value="">Select version to preview</option>`;
  if (!Array.isArray(history)) return;
  history.forEach(ver =>
    select.innerHTML += `<option value="${ver.filename}">${ver.timestamp}</option>`
  );
  select.onchange = () => {
    const versionFile = select.value;
    if (!versionFile) {
      previewDiv.textContent = "";
      restoreBtn.disabled = true;
      versionPreviewContent = "";
      return;
    }
    fetch(`http://localhost:3000/api/prompts/history/${encodeURIComponent(versionFile)}`)
      .then(res => res.json())
      .then(({ content }) => {
        previewDiv.textContent = content || "(empty)";
        versionPreviewContent = content || "";
        restoreBtn.disabled = false;
      });
  };
  restoreBtn.onclick = () => {
    if (!versionPreviewContent) return alert("No content to restore!");
    if (!confirm("Restore this version? This will overwrite the current prompt (a new backup will be made).")) return;
    document.getElementById("editor-text").value = versionPreviewContent;
    handleTextEdit();
    previewDiv.textContent = "";
    select.value = "";
    restoreBtn.disabled = true;
    versionPreviewContent = "";
  };
}

// --- DOMContentLoaded: Attach all DOM event handlers ---
document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("login-btn").onclick = function () {
    loadPrompts();
  };
  document.getElementById("secret").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      loadPrompts();
    }
  });

  document.getElementById("add-prompt-btn").onclick = function() {
    document.getElementById("addPromptModal").style.display = "flex";
    document.getElementById("new-prompt-filename").value = "";
    document.getElementById("new-prompt-label").value = "";
    document.getElementById("new-prompt-component").value = "call1";
    document.getElementById("add-prompt-status").textContent = "";
  };
  document.getElementById("cancel-add-prompt").onclick = function() {
    document.getElementById("addPromptModal").style.display = "none";
  };
  document.getElementById("submit-add-prompt").onclick = function() {
    const secret = sessionStorage.getItem("adminSecret");
    const filename = document.getElementById("new-prompt-filename").value.trim();
    const label = document.getElementById("new-prompt-label").value.trim();
    const component = document.getElementById("new-prompt-component").value.trim();

    if (!filename.endsWith('.txt')) {
      document.getElementById("add-prompt-status").textContent = "❌ Filename must end with .txt";
      return;
    }
    if (!filename || !label || !component) {
      document.getElementById("add-prompt-status").textContent = "❌ Please fill all fields";
      return;
    }

    fetch("http://localhost:3000/api/prompts/" + encodeURIComponent(filename), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": secret
      },
      body: JSON.stringify({
        content: "",
        label: label,
        component: component,
        tags: []
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        document.getElementById("add-prompt-status").textContent = "✅ Created!";
        setTimeout(() => {
          document.getElementById("addPromptModal").style.display = "none";
          loadPrompts(() => {
            const promptButtons = document.querySelectorAll("#prompt-list button");
            promptButtons.forEach(btn => {
              if (btn.textContent.includes(filename)) {
                btn.click();
              }
            });
          });
        }, 1000);
      } else {
        document.getElementById("add-prompt-status").textContent = "❌ " + (data.error || "Error");
      }
    })
    .catch(err => {
      document.getElementById("add-prompt-status").textContent = "❌ Network error";
    });
  };

  document.getElementById("search").addEventListener("input", (e) => {
    renderPromptList(e.target.value);
  });
});
