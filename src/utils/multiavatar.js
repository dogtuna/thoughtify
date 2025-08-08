
// Lightweight avatar generator producing simple cartoon faces.
// Deterministic output based on a seed string.
export default function multiavatar(seed = "") {
  // hash function to generate deterministic numbers from the seed
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const pick = (arr) => arr[Math.abs((hash = (hash * 31 + 17) | 0)) % arr.length];

  const skinColors = ["#f8d4a6", "#e0ac69", "#c68642", "#8d5524"];
  const eyeShapes = [
    '<circle cx="35" cy="40" r="5"/><circle cx="65" cy="40" r="5"/>',
    '<ellipse cx="35" cy="40" rx="6" ry="4"/><ellipse cx="65" cy="40" rx="6" ry="4"/>',
    '<rect x="30" y="36" width="10" height="8" rx="2"/><rect x="60" y="36" width="10" height="8" rx="2"/>'
  ];
  const mouths = [
    '<path d="M30 60 q20 20 40 0" stroke="#000" stroke-width="3" fill="none"/>',
    '<path d="M30 60 q20 -10 40 0" stroke="#000" stroke-width="3" fill="none"/>',
    '<line x1="30" y1="60" x2="70" y2="60" stroke="#000" stroke-width="3"/>'
  ];
  const hairStyles = [
    '<path d="M15 25 q35 -30 70 0 v10 h-70z" fill="#333"/>',
    '<path d="M15 30 q35 -20 70 0 v5 h-70z" fill="#855"/>',
    '<path d="M15 20 q35 -10 70 0 v15 h-70z" fill="#964B00"/>'
  ];

  const skin = pick(skinColors);
  const eyes = pick(eyeShapes);
  const mouth = pick(mouths);
  const hair = pick(hairStyles);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    `  <circle cx="50" cy="50" r="40" fill="${skin}" />`,
    `  ${hair}`,
    `  <g fill="#000">${eyes}</g>`,
    `  ${mouth}`,
    '</svg>'
  ].join('\n');
}
