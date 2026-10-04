import { findUser, primaryRole, type User } from "./user.js";

export function renderReport(users: User[], id: number): string {
  const user = findUser(users, id);
  const role: string = primaryRole(user);
  return `${user.fullName} <${user.email}> (${role.toUpperCase()})`;
}
