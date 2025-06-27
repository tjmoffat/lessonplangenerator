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

const allowedOrigins = [
  "https://lessonpilotai.com",
  "http://lessonpilotai.com",
  "https://www.lessonpilotai.com",
  "http://localhost:51754",
  "http://localhost:3000"
];

const corsOptions = {
  origin: function (origin, callback) {
  console.log("🔎 CORS request from origin:", origin);
  // Allow requests with no origin or from "null" (common in some tools or file:// access)
  if (!origin || origin === 'null' || allowedOrigins.includes(origin)) {
    return callback(null, true);
  } else {
    console.log("❌ CORS blocked:", origin);
    return callback(new Error("CORS not allowed for this origin"));
  }
}
};

app.use(cors(corsOptions));

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

app.get('/api/prompts', (req, res) => {
  try {
    const metadataPath = path.join(__dirname, 'prompts', 'metadata.json');
    const data = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(data);
    // Respond with the entire metadata object
    return res.json(metadata);
  } catch (err) {
    console.error("❌ Error reading metadata:", err.message);
    return res.status(500).json({ error: "Failed to load prompt metadata" });
  }
});

// --- GET: Fetch content for a specific version file (history preview) ---
app.get('/api/prompts/history/:versionFile', (req, res) => {
  const versionFile = req.params.versionFile;

  // Security: Only allow .txt files, no path traversal
  if (!/^[\w\-\.]+\.txt$/.test(versionFile)) {
    return res.status(400).json({ error: "Invalid version file name." });
  }
  const historyPath = path.join(__dirname, 'prompts', 'history', versionFile);

  if (!fs.existsSync(historyPath)) {
    return res.status(404).json({ error: "Version file not found." });
  }
  try {
    const content = fs.readFileSync(historyPath, 'utf-8');
    return res.json({ content });
  } catch (err) {
    return res.status(500).json({ error: "Failed to read version file." });
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

// 🟦 Get one prompt file's content (NEW API ENDPOINT)
app.get('/api/prompts/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    // Basic filename validation to prevent path traversal
    if (!/^[\w\-.]+\.txt$/.test(filename)) {
      return res.status(400).json({ error: "Invalid filename." });
    }
    const filePath = path.join(__dirname, 'prompts', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Prompt file not found." });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return res.json({ content });
  } catch (err) {
    console.error("❌ Error reading prompt file:", err.message);
    return res.status(500).json({ error: "Failed to read prompt file." });
  }
});

// --- Create a new prompt file and metadata entry ---
app.post('/api/prompts/:filename', express.json(), (req, res, next) => {
  const filename = req.params.filename;
  if (!/^[\w\-\.]+\.txt$/.test(filename)) {
    return res.status(400).json({ error: "Invalid filename." });
  }
  const promptsDir = path.join(__dirname, 'prompts');
  const filePath = path.join(promptsDir, filename);
  const metadataPath = path.join(promptsDir, 'metadata.json');
  const adminSecret = req.headers["x-admin-secret"];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Only allow creation if file doesn't exist
  if (fs.existsSync(filePath)) {
    // If the file already exists, skip to the next route for updating
    return next();
  }

  // Write the new prompt file (empty or with provided content)
  fs.writeFileSync(filePath, req.body.content || '', 'utf-8');

  // Update metadata.json
  let metadata = {};
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  }
  metadata[filename] = {
    label: req.body.label || filename,
    tags: req.body.tags || [],
    component: req.body.component || "call1",
    history: []
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

  return res.json({ success: true });
});

// 🟦 Save (update) prompt content with version backup
app.post('/api/prompts/:filename', express.json(), (req, res) => {
  try {
    const filename = req.params.filename;
    const newContent = req.body.content;

    // Basic filename validation
    if (!/^[\w\-.]+\.txt$/.test(filename)) {
      return res.status(400).json({ error: "Invalid filename." });
    }

    const promptsDir = path.join(__dirname, 'prompts');
    const filePath = path.join(promptsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Prompt file not found." });
    }

    // ---- Versioning logic ----
    const historyDir = path.join(promptsDir, 'history');
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir);

    // Load current metadata
    const metadataPath = path.join(promptsDir, 'metadata.json');
    let metadata = {};
    if (fs.existsSync(metadataPath)) {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    }

    // Build version filename (e.g., prompt1_v20240625T112800.txt)
    const ts = new Date().toISOString().replace(/[-:.]/g, "").slice(0,15); // e.g., 20250625T112830
    const versionFilename = filename.replace(/\.txt$/, `_v${ts}.txt`);
    const versionFilePath = path.join(historyDir, versionFilename);

    // Copy current version to history
    fs.copyFileSync(filePath, versionFilePath);

    // Add to metadata history
    if (!metadata[filename]) metadata[filename] = { history: [] };
    if (!metadata[filename].history) metadata[filename].history = [];
    metadata[filename].history.unshift({
      filename: versionFilename,
      timestamp: new Date().toISOString()
    });

    // Save new prompt content to file
    fs.writeFileSync(filePath, newContent, 'utf-8');

    // 🚨 Data loss safeguard: Prevent saving if too few prompts in metadata
if (Object.keys(metadata).length < 4) {
  console.error("WARNING: Attempting to save metadata.json with less than 4 prompts. Data loss risk!");
  return res.status(500).json({ error: "Too few prompts! Refusing to save." });
}

    // Write updated metadata
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    return res.json({ success: true, backup: versionFilename });
  } catch (err) {
    console.error("❌ Error saving prompt file:", err.message);
    return res.status(500).json({ error: "Failed to save prompt file." });
  }
});

// --- Delete a prompt file and its metadata entry ---
app.delete('/api/prompts/:filename', (req, res) => {
  const adminSecret = req.headers["x-admin-secret"];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const filename = req.params.filename;
  if (!/^[\w\-\.]+\.txt$/.test(filename)) {
    return res.status(400).json({ error: "Invalid filename." });
  }

  const promptsDir = path.join(__dirname, 'prompts');
  const filePath = path.join(promptsDir, filename);
  const metadataPath = path.join(promptsDir, 'metadata.json');

  // Delete the file if it exists
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Update metadata.json
  let metadata = {};
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    delete metadata[filename];
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  return res.json({ success: true });
});


// 👇 PASTE THE NEW TAGS ENDPOINT BELOW THIS LINE

app.post('/api/prompts/:filename/tags', express.json(), (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const filename = req.params.filename;
  const tags = req.body.tags;

  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: "Tags must be an array" });
  }

  const promptsDir = path.join(__dirname, 'prompts');
  const metaPath = path.join(promptsDir, 'metadata.json');

  let metadata = {};
  try {
    metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch (e) {
    return res.status(500).json({ error: "Failed to read metadata" });
  }

  // If prompt entry doesn't exist in metadata, create it
  if (!metadata[filename]) {
    metadata[filename] = { tags: [], history: [] };
  }
  metadata[filename].tags = tags;

  try {
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
  } catch (e) {
    return res.status(500).json({ error: "Failed to write metadata" });
  }

  res.json({ success: true });
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

  try {
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

    // Create an empty prompt file if it doesn't exist yet
    const newPromptFilePath = path.join(promptsDir, filename);
    if (!fs.existsSync(newPromptFilePath)) {
      fs.writeFileSync(newPromptFilePath, "", 'utf8');
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Error saving new prompt metadata:", err);
    return res.status(500).json({ error: "Failed to save new prompt metadata" });
  }
});


server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the backend at http://localhost:${PORT}`);
});
