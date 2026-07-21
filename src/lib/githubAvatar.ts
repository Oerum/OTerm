export function githubAvatarLogin(login: string): string {
  return login.trim().replace(/\[bot\]$/i, "");
}

export function githubAvatarUrl(login: string, size = 64): string {
  const name = githubAvatarLogin(login);
  if (!name) return "";
  return `https://github.com/${encodeURIComponent(name)}.png?size=${size}`;
}

export function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "from-pink-500 to-rose-500",
    "from-purple-500 to-indigo-500",
    "from-blue-500 to-cyan-500",
    "from-teal-500 to-emerald-500",
    "from-green-500 to-lime-500",
    "from-yellow-500 to-amber-500",
    "from-orange-500 to-red-500",
  ];
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}
