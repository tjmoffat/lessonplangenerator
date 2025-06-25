require('dotenv').config(); // Loads environment variables from .env file
const express = require('express'); // Web framework for Node.js
const cors = require('cors'); // Middleware for enabling Cross-Origin Resource Sharing
const http = require('http'); // <-- Needed for custom timeout
const { loadPrompt } = require('./utils/promptLoader'); // For loading prompt files
const PPTXGenJS = require("pptxgenjs");
const path = require("path");
const fs = require("fs"); // <-- Needed for reading and writing files

const OpenAI = require('openai'); // OpenAI API client library
const { Document, Packer, Paragraph, HeadingLevel } = require("docx");
const multer = require('multer');
const upload = multer();

const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
server.setTimeout(180000); // 3 minutes

// Configure OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());

// Utility: Call OpenAI GPT-4o with max_tokens set to 8000
async function callGPT(prompt, model = "gpt-4o") {
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 8000
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error("GPT error:", err);
    throw err;
  }
}

// 🟦 Helper function so /generate-lesson works
async function generateGptOutput(prompt, params) {
  // For now, just send the prompt as-is.
  // (If you want to merge params into prompt, add template logic here.)
  return await callGPT(prompt);
}

// Main lesson generation endpoint
app.post('/generate-lesson', async (req, res) => {
  try {
    // 1. Get user input from frontend
    const userInput = req.body;
    console.log('🟦 User input received:', userInput);

    // 2. === GPT CALL 1: LESSON PLAN ===
    const lessonPlanPromptVars = { ...userInput };
    const lessonPlanPrompt = loadPrompt('prompt1.txt', lessonPlanPromptVars);
    const lessonPlanOutput = await callGPT(lessonPlanPrompt);

    // 3. Extract vocabulary list from within the lesson plan output
    const vocabMatch = lessonPlanOutput.match(/=== VOCABULARY LIST ===([\s\S]*?)=== END VOCABULARY LIST ===/);
    const vocabularyList = vocabMatch ? vocabMatch[1].trim() : "";

    // Keep full output for now (we'll filter later if needed)
    const lessonPlanSection1and2 = lessonPlanOutput;

    // 4. === GPT CALL 2: MFP + READING PASSAGE ===
    const prompt2Vars = {
      lessonPlanSection1and2,
      vocabularyList
    };
    const mfpReadingPrompt = loadPrompt('prompt2.txt', prompt2Vars);
    const mfpReadingOutput = await callGPT(mfpReadingPrompt);

    // Extract reading passage from Prompt 2 output
    const mfpReading = mfpReadingOutput || "";

    let mfpDocument = "";
    let readingPassageOnly = "";

    // Use RegExp to extract the blocks between markers
    const mfpMatch = mfpReading.match(/=== START MFP ===([\s\S]*?)=== END MFP ===/);
    const passageOnlyMatch = mfpReading.match(/=== START PASSAGE ===([\s\S]*?)=== END PASSAGE ===/);

    mfpDocument = mfpMatch ? mfpMatch[1].trim() : "";
    readingPassageOnly = passageOnlyMatch ? passageOnlyMatch[1].trim() : "";

    // 5. === GPT CALL 3: STUDENT HANDOUT ===
    const prompt3Vars = {
      lessonPlanSection1and2,
      readingPassage: readingPassageOnly
    };
    const handoutPrompt = loadPrompt('prompt3.txt', prompt3Vars);
    const handoutOutput = await callGPT(handoutPrompt);

    // 6. === GPT CALL 4: SLIDES ===
    const prompt4Vars = {
      fullLessonPlan: lessonPlanOutput,
      studentHandout: handoutOutput
    };
    const slidesPrompt = loadPrompt('prompt4.txt', prompt4Vars);
    const slidesOutput = await callGPT(slidesPrompt);
    console.log("✅ Prompt 4 output (Slides):\n", slidesOutput);

    res.json({
      lessonPlan: lessonPlanOutput,
      mfpDocument: mfpDocument,
      readingPassage: readingPassageOnly,
      handout: handoutOutput,
      slides: slidesOutput
    });
  } catch (err) {
    console.error("❌ Error generating lesson:", err);
    res.status(500).json({ error: "Lesson generation failed." });
  }
});
// --------------------------------------------------

// Test route for verifying prompt injection
app.get('/test-prompt', (req, res) => {
  const variables = {
    title: "The World of Animals",
    topic: "Animals",
    primaryFocus: "Vocabulary",
    secondaryFocus: "Speaking",
    framework: "CEFR",
    level: "A2",
    ageGroup: "10-12",
    classSize: "16",
    duration: "60",
    learningObjectives: "Describe and talk about animals"
  };
  const promptText = loadPrompt('prompt1.txt', variables);
  res.send(`<pre>${promptText}</pre>`);
});

app.get("/admin/prompts", (req, res) => {
  const adminSecret = req.headers["x-admin-secret"];
  console.log("🔐 Incoming admin secret:", adminSecret);
  console.log("✅ ENV ADMIN_SECRET:", process.env.ADMIN_SECRET);

  if (adminSecret !== process.env.ADMIN_SECRET) {
    console.log("❌ Unauthorized access attempt");
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Log the current __dirname and cwd
  console.log("__dirname is:", __dirname);
  console.log("process.cwd() is:", process.cwd());

  const metadataPath = path.join(__dirname, "prompts", "metadata.json");
  console.log("📄 Trying to read:", metadataPath);

  try {
    const data = fs.readFileSync(metadataPath, "utf-8");
    const metadata = JSON.parse(data);
    console.log("✅ Loaded metadata:", metadata.length, "prompts");
    return res.json(metadata);
  } catch (err) {
    console.log("❌ Error reading metadata:", err.message);
    console.log("❌ Error stack:", err.stack);
    return res.status(500).json({ error: "Failed to load prompt metadata" });
  }
});

// GET one prompt file's content
app.get("/admin/prompt", (req, res) => {
  const adminSecret = req.headers["x-admin-secret"];
  console.log("🔐 Incoming admin secret:", adminSecret);
  console.log("✅ ENV ADMIN_SECRET:", process.env.ADMIN_SECRET);
  
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const fileName = req.query.name;
  if (!fileName) {
    return res.status(400).json({ error: "Missing prompt file name" });
  }

  const filePath = path.join(__dirname, "prompts", fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Prompt file not found" });
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return res.json({ content });
  } catch (err) {
    return res.status(500).json({ error: "Failed to read prompt file" });
  }
});
// ------ EXPORT DOCX ENDPOINT -------
app.post("/export-docx", express.json(), async (req, res) => {
  try {
    const { content, lessonPlan, mfpDocument, readingPassage, handout, slides } = req.body;

    // Decide which HTML content to export (single section or full lesson)
    let htmlToConvert = "";

    if (content) {
      // Exporting single section (button per section)
      htmlToConvert = content;
    } else {
      // Exporting full lesson - build one HTML string with headings & content
      htmlToConvert = `
        <h1>Lesson Plan</h1>
        <div>${lessonPlan || ""}</div>
        <h1>MFP Document</h1>
        <div>${mfpDocument || ""}</div>
        <h1>Reading/Listening Passage</h1>
        <div>${readingPassage || ""}</div>
        <h1>Student Handout</h1>
        <div>${handout || ""}</div>
        <h1>Slide Deck Text</h1>
        <div>${slides || ""}</div>
      `;
    }

    const htmlToDocx = (await import('html-to-docx')).default;
    const fileBuffer = await htmlToDocx(htmlToConvert, null, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=${content ? "section" : "lesson"}.docx`);
    res.send(fileBuffer);

  } catch (err) {
    console.error("❌ DOCX export failed:", err);
    res.status(500).json({ error: "Failed to export Word document." });
  }
});

// ------ EXPORT PPTX ENDPOINT -------
app.post("/export-pptx", express.json(), async (req, res) => {
  try {
    const { slides } = req.body;

    if (!slides) {
      return res.status(400).json({ error: "No slide content provided." });
    }

    const pptx = new PPTXGenJS();

    // Split the slides text by slide headings (assumes "##" denotes new slide)
    const slideBlocks = slides.split(/^##\s*(.+)$/m).filter(Boolean);

    // Parse into pairs: [heading, content]
    for (let i = 0; i < slideBlocks.length; i += 2) {
      const title = slideBlocks[i].trim();
      const content = slideBlocks[i + 1] ? slideBlocks[i + 1].trim() : "";

      const slide = pptx.addSlide();
      slide.addText(title, {
        x: 0.5, y: 0.3, fontSize: 24, bold: true, color: "000000",
      });
      slide.addText(content, {
        x: 0.5, y: 1.2, fontSize: 14, color: "333333", 
        wrap: true,
        bullet: true,
        margin: 10,
        shape: pptx.ShapeType.rect,
        fill: "F1F1F1"
      });
    }

    pptx.write('nodebuffer').then(buffer => {
      res.setHeader('Content-Disposition', 'attachment; filename=lesson.pptx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.send(buffer);
    }).catch(err => {
      console.error("❌ PPTX export failed:", err);
      res.status(500).json({ error: "Failed to export PowerPoint presentation." });
    });
  } catch (err) {
    console.error("❌ Route error:", err);
    res.status(500).json({ error: "Failed to export PowerPoint presentation." });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the backend at http://localhost:${PORT}`);
});
