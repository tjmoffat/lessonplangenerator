document.addEventListener('DOMContentLoaded', function() {
  // Utility to populate Language Level options based on Proficiency Scale
  function updateLevelOptions() {
    const scaleSelect = document.getElementById('proficiencyScale');
    const levelSelect = document.getElementById('level');
    if (!scaleSelect || !levelSelect) return;
    if (scaleSelect.value === 'other') return; // skip for custom

    let options = [];
    switch (scaleSelect.value) {
      case 'cefr':
        options = [
          { value: 'a1', text: 'A1 (Beginner)' },
          { value: 'a2', text: 'A2 (Elementary)' },
          { value: 'b1', text: 'B1 (Intermediate)' },
          { value: 'b2', text: 'B2 (Upper-Intermediate)' },
          { value: 'c1', text: 'C1 (Advanced)' },
          { value: 'c2', text: 'C2 (Proficiency)' }
        ]; break;
      case 'cambridge':
        options = [
          { value: 'starters', text: 'Starters' },
          { value: 'movers', text: 'Movers' },
          { value: 'flyers', text: 'Flyers' },
          { value: 'ket', text: 'KET' },
          { value: 'pet', text: 'PET' },
          { value: 'fce', text: 'FCE' },
          { value: 'cae', text: 'CAE' }
        ]; break;
      case 'ielts':
        options = [
          { value: 'band-3-4', text: 'Band 3–4 (Basic)' },
          { value: 'band-5-6', text: 'Band 5–6 (Intermediate)' },
          { value: 'band-6-7', text: 'Band 6.5–7.5 (Upper Intermediate–Advanced)' },
          { value: 'band-8plus', text: 'Band 8+ (Proficient)' }
        ]; break;
      case 'igcse':
        options = [
          { value: 'core', text: 'Core' },
          { value: 'extended', text: 'Extended' }
        ]; break;
      case 'ib':
        options = [
          { value: 'ib-sl', text: 'Standard Level' },
          { value: 'ib-hl', text: 'Higher Level' }
        ]; break;
      case 'toefl':
        options = [
          { value: 'toefl-basic', text: 'Basic (0–30)' },
          { value: 'toefl-intermediate', text: 'Intermediate (31–60)' },
          { value: 'toefl-advanced', text: 'Advanced (61–90)' },
          { value: 'toefl-expert', text: 'Expert (91–120)' }
        ]; break;
      default:
        options = [];
    }

    // Clear and rebuild dropdown
    levelSelect.innerHTML = '';
    levelSelect.appendChild(new Option('Select level...', ''));
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.text = opt.text;
      levelSelect.appendChild(option);
    });
  }

  // Char counters for all textareas/inputs
  document.querySelectorAll('input[maxlength], textarea[maxlength]').forEach(el => {
    const counter = el.parentElement.querySelector('.char-counter');
    if (!counter) return;
    function update() {
      counter.textContent = `${el.value.length}/${el.maxLength} characters`;
    }
    el.addEventListener('input', update);
    update();
  });

  // Proficiency Scale logic
  const scaleSelect = document.getElementById('proficiencyScale');
  const customScaleInput = document.getElementById('customProficiencyScale');
  const customLevelInput = document.getElementById('customLevel');
  const levelSelect = document.getElementById('level');

  scaleSelect.addEventListener('change', function() {
    if (scaleSelect.value === 'other') {
      customScaleInput.style.display = 'block';
      customScaleInput.required = true;
      customLevelInput.style.display = 'block';
      customLevelInput.required = true;
      levelSelect.style.display = 'none';
    } else {
      customScaleInput.style.display = 'none';
      customScaleInput.required = false;
      customScaleInput.value = '';
      customLevelInput.style.display = 'none';
      customLevelInput.required = false;
      customLevelInput.value = '';
      levelSelect.style.display = '';
    }
    updateLevelOptions();
  });

  // --- Add this to update dropdown at page load ---
  updateLevelOptions();

  // --- Restore previous selections ---
  if (localStorage.getItem('lessonFormSelections')) {
    const data = JSON.parse(localStorage.getItem('lessonFormSelections'));
    Object.keys(data).forEach(name => {
      const el = document.getElementsByName(name)[0];
      if (el) el.value = data[name];
    });
    updateLevelOptions();
  }

  // -------------- FORM SUBMIT HANDLER (Main Fix) --------------------
  document.getElementById('lessonForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const spinner = document.getElementById('spinnerOverlay');
    spinner.style.display = "block"; // Use style for overlay spinner
    const formData = new FormData(this);
    const data = {};
    for (let [key, value] of formData.entries()) {
        if (data[key]) {
            if (Array.isArray(data[key])) { data[key].push(value);}
            else { data[key] = [data[key], value]; }
        } else {
            data[key] = value;
        }
    }
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    const learningSupport = [];
    checkboxes.forEach(cb => learningSupport.push(cb.value));
    data.learningSupport = learningSupport;
    try {
        const BACKEND_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://lessonplangenerator.onrender.com";

      const response = await fetch(`${BACKEND_URL}/generate-lesson`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

      if (!response.ok) throw new Error('Network response was not ok');
      const result = await response.json();


        // Save all outputs to localStorage for the preview page
        localStorage.setItem('lessonOutputs', JSON.stringify(result));

        // Redirect to the preview page
        window.location.href = 'preview.html';

    } catch (err) {
        spinner.style.display = "none";
        alert("❌ Error generating lesson plan. Please try again later.");
        console.error(err);
    }
});
  // Collapsible section toggles
 document.querySelectorAll('.collapse-toggle').forEach(button => {
  button.addEventListener('click', () => {
    button.classList.toggle('active');
    const content = button.nextElementSibling;
    if (content && content.classList.contains('collapsible-content')) {
      content.style.display = content.style.display === 'block' ? 'none' : 'block';
    }
  });
});
});
