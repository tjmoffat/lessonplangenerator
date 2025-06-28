// backend/test-onepage-docxtemplater.js
const fs = require("fs");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

// Load the template
const content = fs.readFileSync("templates/one_page_lesson_plan.docx", "binary");
const zip = new PizZip(content);
const doc = new Docxtemplater(zip);

// Set up your test data
doc.render({
  lessonTitle: "Exploring Gravity",
  primaryFocus: "Introduction to Forces",
  topic: "Gravity",
  level: "Beginner",
  ageGroup: "8-10",
  duration: "45",
  classSize: "25",
  targetVocabulary: "gravity, force, mass, weight",
  equipmentNeeded: "ball, ruler, paper",
  mainAim: "Understand the concept of gravity",
  subAim1: "Practice measuring weights",
  subAim2: "Differentiate between mass and weight"
});

// Save the output
const buf = doc.getZip().generate({ type: "nodebuffer" });
fs.writeFileSync("output_onepage.docx", buf);
console.log("Done! Check output_onepage.docx in your backend folder.");
