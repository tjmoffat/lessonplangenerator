// backend/test-onepage-docxtemplater.js
const fs = require("fs");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

// Load the template
const content = fs.readFileSync("templates/simple_test.docx", "binary");
const zip = new PizZip(content);
const doc = new Docxtemplater(zip);

// Set up your test data
doc.render({
  duration: 60,
});

// Save the output
const buf = doc.getZip().generate({ type: "nodebuffer" });
fs.writeFileSync("detailed_lesson_plan_test_1.docx", buf);
console.log("Done! Check your backend folder. You'll be rich soon.");
