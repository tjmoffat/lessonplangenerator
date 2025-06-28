const fs = require("fs");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

/**
 * Parses a raw lesson plan text output (from GPT) into an object matching your docx template.
 * @param {string} rawText
 * @returns {object}
 */
function parseLessonOverview(rawText) {
  // Helper to extract a single-line field
  function extract(label) {
    const regex = new RegExp(label + '\\s*:(.*)');
    const match = rawText.match(regex);
    return match ? match[1].trim() : '';
  }

  // Helper to extract bullet lists (e.g. for Equipment Needed)
  function extractList(startLabel) {
    const regex = new RegExp(startLabel + '[\\s\\S]*?((?:- .*\n?)+)', 'i');
    const match = rawText.match(regex);
    if (match) {
      // Join list items with line breaks (Word expects text, not <ul>)
      return match[1].replace(/- /g, '• ').trim();
    }
    return '';
  }

  return {
    primaryFocus: extract('Lesson Focus'),
    topic: extract('Topic'),
    level: extract('Level'),
    ageGroup: extract('Age Group'),
    duration: extract('Duration'),
    classSize: extract('Class Size'),
    targetVocabulary: extract('Secondary Focus'), // adjust if needed!
    equipmentNeeded: extractList('Part 3: Materials Needed'),
    mainAim: extract('Main Aim'),
    subAim1: extract('Sub-Aim 1'),
    subAim2: extract('Sub-Aim 2'),
  };
}

// --- MAIN SCRIPT STARTS HERE ---

// Load the template
const content = fs.readFileSync("templates/one_page_lesson_plan.docx", "binary");
const zip = new PizZip(content);
const doc = new Docxtemplater(zip);

// Read lesson plan text
const lessonText = fs.readFileSync("UNMISS_Lesson_Plan.txt", "utf-8");

// Parse it!
const lessonData = parseLessonOverview(lessonText);

// Fill the template with real data
doc.render(lessonData);

// Save the output
const buf = doc.getZip().generate({ type: "nodebuffer" });
fs.writeFileSync("output_onepage.docx", buf);
console.log("Done! Check output_onepage.docx in your backend folder.");
