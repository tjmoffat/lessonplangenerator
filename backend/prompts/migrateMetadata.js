// backend/prompts/migrateMetadata.js

const fs = require('fs');
const path = require('path');

// Read your current metadata.json (array style)
const metadataPath = path.join(__dirname, 'metadata.json');
const outPath = path.join(__dirname, 'metadata_converted.json');

const arr = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

const obj = {};
arr.forEach(item => {
  // If you already have history/tags, keep them. Add placeholders if not.
  obj[item.filename] = {
    label: item.label || "",
    tags: item.tags || [],
    component: item.component || "",
    history: item.history || [] // Will use [] for now, fill on first save
  };
});

fs.writeFileSync(outPath, JSON.stringify(obj, null, 2));
console.log("Converted metadata written to metadata_converted.json");