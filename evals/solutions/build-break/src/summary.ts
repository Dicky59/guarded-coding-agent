import type { User } from "./user.js";

export function names(users: User[]): string[] {
  return users.map((u) => u.name);
}

export function countByRole(users: User[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const user of users) {
    for (const role of user.roles) {
      counts[role] = (counts[role] ?? 0) + 1;
    }
  }
  return counts;
}
