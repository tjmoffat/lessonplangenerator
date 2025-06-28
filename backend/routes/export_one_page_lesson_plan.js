const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const { parseLessonOverview } = require("../utils/lessonParser");

router.post("/", (req, res) => {
  const lessonText = req.body.lessonText;
  if (!lessonText) {
    return res.status(400).json({ error: "Missing lessonText in request body" });
  }

  // Parse lesson text
  const lessonData = parseLessonOverview(lessonText);
  console.log("Lesson Data Sent to Template:", lessonData);

  // Load template
  const templatePath = path.join(__dirname, "../templates/one_page_lesson_plan.docx");
  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip);

  // Fill doc
  doc.render(lessonData);

  // Send as .docx
  const buf = doc.getZip().generate({ type: "nodebuffer" });
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": "attachment; filename=OnePageLessonPlan.docx"
  });
  res.send(buf);
});

module.exports = router;
