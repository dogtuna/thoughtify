// Simplified avatar generator inspired by Multiavatar.
// Generates deterministic SVG avatars based on a string seed.
export default function multiavatar(seed = "") {
  const colors = [
    "#e57373",
    "#64b5f6",
    "#81c784",
    "#ba68c8",
    "#ffb74d",
    "#4db6ac",
  ];

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];

  const initials = seed
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="45" fill="${color}" />
    <text x="50" y="55" text-anchor="middle" font-size="40" fill="#fff" font-family="Arial, sans-serif">${initials}</text>
  </svg>`;
}
