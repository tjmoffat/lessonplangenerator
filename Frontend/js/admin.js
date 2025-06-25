let allPrompts = [];

function loadPrompts() {
  const secret = document.getElementById("secret").value;
  if (!secret) {
    alert("Admin secret required");
    return;
  }

  fetch("http://localhost:3000/admin/prompts", {
    headers: { "x-admin-secret": secret },
  })
    .then((res) => {
      if (!res.ok) throw new Error("Unauthorized or server error");
      return res.json();
    })
    .then((data) => {
      allPrompts = data;
      sessionStorage.setItem("adminSecret", secret);
      document.getElementById("search-section").style.display = "block";
      document.getElementById("secret").disabled = true;
      renderPromptList("");
    })
    .catch((err) => alert("Error: " + err.message));
}

function renderPromptList(query) {
  const container = document.getElementById("prompt-list");
  container.innerHTML = "";

  const q = query.trim().toLowerCase();

  const filtered = allPrompts.filter((prompt) => {
    const labelMatch = prompt.label.toLowerCase().includes(q);
    const tagMatch = prompt.tags.some((tag) => tag.toLowerCase().includes(q));
    return labelMatch || tagMatch;
  });

  filtered.forEach((prompt) => {
    const btn = document.createElement("button");
    btn.textContent = `${prompt.label} (${prompt.filename})`;
    btn.onclick = () => alert(`Clicked: ${prompt.filename}`);
    container.appendChild(btn);
  });
}

document.getElementById("search").addEventListener("input", (e) => {
  renderPromptList(e.target.value);
});
