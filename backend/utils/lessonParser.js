function parseLessonOverview(rawText) {
  function extract(label) {
    const regex = new RegExp(label + '\\s*:(.*)');
    const match = rawText.match(regex);
    return match ? match[1].trim() : '';
  }
  function extractList(startLabel) {
    const regex = new RegExp(startLabel + '[\\s\\S]*?((?:- .*\n?)+)', 'i');
    const match = rawText.match(regex);
    if (match) {
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
    targetVocabulary: extract('Secondary Focus'), // change this if needed!
    equipmentNeeded: extractList('Part 3: Materials Needed'),
    mainAim: extract('Main Aim'),
    subAim1: extract('Sub-Aim 1'),
    subAim2: extract('Sub-Aim 2'),
  };
}

module.exports = { parseLessonOverview };
