import { findUser, primaryRole, type User } from "./user.js";

export function renderReport(users: User[], id: number): string {
  const user = findUser(users, id);
  if (!user) return `Unknown user #${id}`;
  const role = primaryRole(user) ?? "none";
  return `${user.name} <${user.email ?? "no email"}> (${role.toUpperCase()})`;
}
