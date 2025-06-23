// backend/utils/promptLoader.js

const fs = require('fs');
const path = require('path');

// Loads a prompt file and replaces all {{placeholders}} with given values
function loadPrompt(filename, variables = {}) {
  const promptPath = path.join(__dirname, '..', 'prompts', filename);
  let prompt = fs.readFileSync(promptPath, 'utf8');

  // Replace all {{placeholder}} in the prompt with actual values
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    prompt = prompt.replace(regex, value ?? '');
  }

  return prompt;
}

module.exports = { loadPrompt };