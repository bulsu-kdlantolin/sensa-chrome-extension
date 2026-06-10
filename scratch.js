const consumedKeywords = ['next', 'skip', 'next', 'skip'];
let cleanText = 'next next next';
consumedKeywords.forEach(kw => {
  cleanText = cleanText.replace(new RegExp(`\\b${kw}\\b`), " ");
});
cleanText = cleanText.replace(/\s+/g, ' ').trim();
console.log('Result:', cleanText);
