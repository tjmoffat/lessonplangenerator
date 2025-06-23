// Frontend/js/preview.js

function htmlToText(html) {
  let div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

document.addEventListener('DOMContentLoaded', function() {
    // Collapsible logic for preview editors
  document.querySelectorAll('.collapsible-toggle').forEach(button => {
    button.addEventListener('click', function() {
      this.classList.toggle('active');
      const content = this.nextElementSibling;
      content.classList.toggle('show');
    });
  });

  // Open the first collapsible by default (optional)
  const firstToggle = document.querySelector('.collapsible-toggle');
  const firstContent = document.querySelector('.collapsible-content');
  if (firstToggle && firstContent) {
    firstToggle.classList.add('active');
    firstContent.classList.add('show');
  }

  const statusMsg = document.getElementById('statusMsg');

  // Get outputs from localStorage (set by script.js after /generate-lesson)
  const outputs = JSON.parse(localStorage.getItem('lessonOutputs') || '{}');

  // Quill config
  const quillOptions = {
    theme: 'snow',
    modules: {
      toolbar: [
        [{header: [1, 2, 3, false]}],
        ['bold', 'italic', 'underline', 'strike'],
        [{list: 'ordered'}, {list: 'bullet'}],
        ['link', 'blockquote', 'code-block'],
        ['clean']
      ]
    }
  };

  // Create editors for each section
  const editors = {
    lessonPlan: new Quill('#lessonPlanEditor', quillOptions),
    mfpDocument: new Quill('#mfpEditor', quillOptions),
    readingPassage: new Quill('#passageEditor', quillOptions),
    handout: new Quill('#handoutEditor', quillOptions),
    slides: new Quill('#slidesEditor', quillOptions)
  };

    // Convert markdown to HTML, then safely load into Quill editors as Delta
function setQuillContentFromMarkdown(editor, markdownText) {
  if (!markdownText) return;
  let html = marked.parse(markdownText);

  // Ensure blank lines between paragraphs
  html = html.replace(/<\/p>\s*<p>/g, '</p><p><br></p><p>');

  editor.clipboard.dangerouslyPasteHTML(html);
}

setQuillContentFromMarkdown(editors.lessonPlan, outputs.lessonPlan);
setQuillContentFromMarkdown(editors.mfpDocument, outputs.mfpDocument);
setQuillContentFromMarkdown(editors.readingPassage, outputs.readingPassage);
setQuillContentFromMarkdown(editors.handout, outputs.handout);
setQuillContentFromMarkdown(editors.slides, outputs.slides);

  document.getElementById('exportDocxBtn').addEventListener('click', async function() {
  const statusMsg = document.getElementById('statusMsg');
  statusMsg.textContent = "Generating Word document...";
  try {
    const data = {
      lessonPlan: htmlToText(editors.lessonPlan.root.innerHTML),
      mfpDocument: htmlToText(editors.mfpDocument.root.innerHTML),
      readingPassage: htmlToText(editors.readingPassage.root.innerHTML),
      handout: htmlToText(editors.handout.root.innerHTML),
      slides: htmlToText(editors.slides.root.innerHTML)
    };

    const response = await fetch('http://localhost:3000/export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Export failed');

    // Blob download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    // Create a temporary link and trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lesson.docx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    statusMsg.textContent = "Download started!";
    setTimeout(() => statusMsg.textContent = '', 2000);
  } catch (err) {
    statusMsg.textContent = "❌ Export failed. Please try again.";
    setTimeout(() => statusMsg.textContent = '', 3000);
    console.error(err);
  }
});

// Export DOCX or PPTX for individual sections
document.querySelectorAll('.export-section-btn').forEach(btn => {
  btn.addEventListener('click', async function() {
    const section = btn.getAttribute('data-section');
    const statusMsg = document.getElementById('statusMsg');
    
    if (section === "slidesPptx") {
  statusMsg.textContent = "Generating PowerPoint...";
  try {
    // Use the ORIGINAL MARKDOWN (not Quill HTML!) so the backend splits slides properly
    // This is loaded from localStorage at the top as 'outputs.slides'
    const slides = outputs.slides || editors.slides.root.innerHTML;
    const response = await fetch('http://localhost:3000/export-pptx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides })
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slides.pptx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    statusMsg.textContent = "Download started!";
    setTimeout(() => statusMsg.textContent = '', 2000);
  } catch (err) {
    statusMsg.textContent = "❌ Export failed. Please try again.";
    setTimeout(() => statusMsg.textContent = '', 3000);
    console.error(err);
  }
  return; // Don't run DOCX export logic below
}

    // (existing DOCX logic below)
    statusMsg.textContent = "Generating Word document...";
    let content = '';
    switch (section) {
      case 'lessonPlan':
        content = editors.lessonPlan.root.innerHTML;
        break;
      case 'mfpDocument':
        content = editors.mfpDocument.root.innerHTML;
        break;
      case 'readingPassage':
        content = editors.readingPassage.root.innerHTML;
        break;
      case 'handout':
        content = editors.handout.root.innerHTML;
        break;
      default:
        statusMsg.textContent = "❌ Unknown section";
        setTimeout(() => statusMsg.textContent = '', 2000);
        return;
    }

    // Send to backend
    try {
      const response = await fetch('http://localhost:3000/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }) // Just send the section content
      });
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // Download file
      const a = document.createElement('a');
      a.href = url;
      // Use section name for file
      a.download = `${section}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      statusMsg.textContent = "Download started!";
      setTimeout(() => statusMsg.textContent = '', 2000);
    } catch (err) {
      statusMsg.textContent = "❌ Export failed. Please try again.";
      setTimeout(() => statusMsg.textContent = '', 3000);
      console.error(err);
    }
  });
});

  // Export PPTX (stub for now)
  document.getElementById('exportPptxBtn').addEventListener('click', function() {
    const data = {
      lessonPlan: editors.lessonPlan.root.innerHTML,
      mfpDocument: editors.mfpDocument.root.innerHTML,
      readingPassage: editors.readingPassage.root.innerHTML,
      handout: editors.handout.root.innerHTML,
      slides: editors.slides.root.innerHTML
};

    // TODO: POST to backend for .pptx creation & download
    statusMsg.textContent = 'PowerPoint export not implemented yet (MVP stub)';
    setTimeout(()=>statusMsg.textContent = '', 3000);
  });
});
