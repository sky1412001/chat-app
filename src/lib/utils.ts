import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const nicknames = [
  "Shadowfox",
  "Nebula",
  "Stormblade",
  "Astra",
  "Vortex",
  "Cipher",
  "Pulse",
  "Specter",
  "Echo",
  "Nova",
  "Titan",
  "Phantom",
  "Zenith",
  "Vector",
  "Quasar",
  "Rogue",
  "Orbit",
  "Blaze",
  "Maverick",
  "Falcon",
];

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function capitalizeName(name: string) {
  if (!name) return "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function nicknameFor(seed: string) {
  const normalized = seed.trim().toLowerCase();
  const index = hashString(normalized) % nicknames.length;
  return nicknames[index];
}

export function formattedUserName(name: string, seed?: string) {
  const capitalized = capitalizeName(name.trim());
  const nickname = nicknameFor(seed ?? capitalized);
  return `${capitalized} (${nickname})`;
}
